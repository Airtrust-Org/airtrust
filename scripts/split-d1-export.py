#!/usr/bin/env python3

import argparse
import re
from pathlib import Path


REDACT_REPLACEMENTS = {
    "auditoria_avancada_v2": {
        "dados_anteriores": "NULL",
        "dados_novos": "NULL",
    },
    "empresas_config": {
        "certificado_template_html": "NULL",
        "certificado_assinatura_digital": "NULL",
        "cores_tema": "'{}'",
        "logo_relatorio": "NULL",
    },
    "escala_publicacao_snapshots": {
        "payload_json": "'{}'",
    },
    "fichas_sessao": {
        "assinatura_instrutor_completa": "NULL",
        "assinatura_aluno_completa": "NULL",
        "assinatura_aluno_imagem": "NULL",
        "assinatura_instrutor_imagem": "NULL",
    },
    "importacoes_log": {
        "raw_data": "NULL",
    },
}


def iter_statements(sql_text: str):
    in_string = False
    buffer = []
    index = 0

    while index < len(sql_text):
        char = sql_text[index]
        buffer.append(char)

        if in_string:
            if char == "'":
                if index + 1 < len(sql_text) and sql_text[index + 1] == "'":
                    buffer.append(sql_text[index + 1])
                    index += 1
                else:
                    in_string = False
        else:
            if char == "'":
                in_string = True
            elif char == ";":
                statement = "".join(buffer).strip()
                if statement:
                    yield statement
                buffer = []

        index += 1

    tail = "".join(buffer).strip()
    if tail:
        yield tail


def split_value_groups(values_sql: str):
    groups = []
    in_string = False
    depth = 0
    start = None
    index = 0

    while index < len(values_sql):
        char = values_sql[index]

        if in_string:
            if char == "'":
                if index + 1 < len(values_sql) and values_sql[index + 1] == "'":
                    index += 1
                else:
                    in_string = False
        else:
            if char == "'":
                in_string = True
            elif char == "(":
                if depth == 0:
                    start = index
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and start is not None:
                    groups.append(values_sql[start : index + 1])
                    start = None

        index += 1

    return groups


def split_top_level_csv(csv_text: str):
    parts = []
    in_string = False
    depth = 0
    start = 0
    index = 0

    while index < len(csv_text):
        char = csv_text[index]

        if in_string:
            if char == "'":
                if index + 1 < len(csv_text) and csv_text[index + 1] == "'":
                    index += 1
                else:
                    in_string = False
        else:
            if char == "'":
                in_string = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            elif char == "," and depth == 0:
                parts.append(csv_text[start:index].strip())
                start = index + 1

        index += 1

    parts.append(csv_text[start:].strip())
    return parts


def redact_insert_statement(statement: str):
    match = re.match(
        r'INSERT INTO\s+"?([^"\s(]+)"?\s*\((.*?)\)\s*VALUES\s*(.*);$',
        statement,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match is None:
        return statement

    table_name = match.group(1)
    replacements = REDACT_REPLACEMENTS.get(table_name)
    if not replacements:
        return statement

    columns = [column.strip().strip('"') for column in split_top_level_csv(match.group(2))]
    redact_indexes = {index: replacements[column] for index, column in enumerate(columns) if column in replacements}
    if not redact_indexes:
        return statement

    value_groups = split_value_groups(match.group(3))
    if not value_groups:
        return statement

    redacted_groups = []
    for group in value_groups:
        values = split_top_level_csv(group[1:-1])
        if len(values) != len(columns):
            return statement

        for index, replacement in redact_indexes.items():
            values[index] = replacement

        redacted_groups.append(f"({','.join(values)})")

    return f'INSERT INTO "{table_name}" ({match.group(2)}) VALUES {",".join(redacted_groups)};'


def split_insert_statement(statement: str, max_stmt_chars: int):
    statement = redact_insert_statement(statement)

    if len(statement) <= max_stmt_chars:
        return [statement]

    match = re.search(r"\bVALUES\b", statement, flags=re.IGNORECASE)
    if match is None:
        return [statement]

    prefix = statement[: match.end()].rstrip()
    values_sql = statement[match.end() :].strip()
    if values_sql.endswith(";"):
        values_sql = values_sql[:-1].rstrip()

    groups = split_value_groups(values_sql)
    if len(groups) <= 1:
        return [statement]

    chunks = []
    current_groups = []

    for group in groups:
        candidate_groups = current_groups + [group]
        candidate = f"{prefix} {','.join(candidate_groups)};"

        if current_groups and len(candidate) > max_stmt_chars:
            chunks.append(f"{prefix} {','.join(current_groups)};")
            current_groups = [group]
        else:
            current_groups = candidate_groups

    if current_groups:
        chunks.append(f"{prefix} {','.join(current_groups)};")

    return chunks


def write_chunk(output_dir: Path, chunk_index: int, statements):
    output_file = output_dir / f"part-{chunk_index:04d}.sql"
    output_file.write_text("\n".join(statements) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Split a D1 export into smaller SQL files")
    parser.add_argument("--input", required=True, help="Path to input SQL dump")
    parser.add_argument("--output-dir", required=True, help="Directory for split SQL files")
    parser.add_argument("--max-stmt-chars", type=int, default=30000)
    parser.add_argument("--max-file-bytes", type=int, default=1000000)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for existing in output_dir.glob("part-*.sql"):
        existing.unlink()

    sql_text = input_path.read_text(encoding="utf-8")

    chunk_index = 1
    current_statements = []
    current_size = 0

    for statement in iter_statements(sql_text):
        for split_statement in split_insert_statement(statement, args.max_stmt_chars):
            statement_text = split_statement if split_statement.endswith(";") else f"{split_statement};"
            statement_size = len(statement_text.encode("utf-8")) + 1

            if current_statements and current_size + statement_size > args.max_file_bytes:
                write_chunk(output_dir, chunk_index, current_statements)
                chunk_index += 1
                current_statements = []
                current_size = 0

            current_statements.append(statement_text)
            current_size += statement_size

    if current_statements:
        write_chunk(output_dir, chunk_index, current_statements)


if __name__ == "__main__":
    main()