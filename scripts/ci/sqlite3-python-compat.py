#!/usr/bin/env python3
"""Real SQLite engine for disposable CI fixtures when the CLI is unavailable.

Supports the CLI options consumed by the test suites, including -bail and -json.
SQL errors fail closed; no remote or production database paths are used by CI.
"""
import json
import re
import sqlite3
import sys


def parse_args(argv):
    output_json = False
    db = None
    sql = None
    for arg in argv:
        if db is None and arg in ('-bail', '-batch', '-noheader'):
            continue
        if db is None and arg == '-json':
            output_json = True
            continue
        if db is None:
            if arg.startswith('-'):
                raise ValueError('SQLITE_CI_UNSUPPORTED_OPTION')
            db = arg
        elif sql is None:
            sql = arg
        else:
            raise ValueError('SQLITE_CI_UNEXPECTED_ARGUMENT')
    if not db:
        raise ValueError('SQLITE_CI_DATABASE_REQUIRED')
    return db, sql, output_json


def statements(source):
    statement = ''
    for line in source.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            if statement.strip():
                yield statement
            statement = ''
    if statement.strip():
        yield statement


def run_sql(db, source, output_json):
    if not source.strip() or source.lstrip().startswith('.'):
        raise ValueError('SQLITE_CI_SQL_REQUIRED')
    with sqlite3.connect(db, isolation_level=None) as connection:
        for statement in statements(source):
            cursor = connection.execute(statement)
            if cursor.description:
                columns = [column[0] for column in cursor.description]
                if output_json:
                    print(json.dumps([dict(zip(columns, row)) for row in cursor], ensure_ascii=False, separators=(',', ':')))
                else:
                    for row in cursor:
                        print('|'.join('' if value is None else str(value) for value in row))


def main():
    db, sql, output_json = parse_args(sys.argv[1:])
    run_sql(db, sql if sql is not None else sys.stdin.read(), output_json)


if __name__ == '__main__':
    try:
        main()
    except (sqlite3.Error, ValueError) as exc:
        # Preserve RAISE(ABORT, 'reason') so fail-closed migration regressions
        # can assert exact guard semantics, but never echo auth material.
        detail = str(exc)
        detail = re.sub(r'(?i)(authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*', '[REDACTED_HEADER]', detail)
        detail = re.sub(r'(?i)bearer\s+[^\s,;]+', 'Bearer [REDACTED]', detail)
        detail = re.sub(r'\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b', '[REDACTED_JWT]', detail)
        print(f'SQLITE_CI_ERROR:{detail}', file=sys.stderr)
        raise SystemExit(1)
