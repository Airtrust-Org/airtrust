#!/usr/bin/env python3
"""SQLite CLI subset for *disposable local CI databases* only.

Used only when the Playwright CI image has Python/SQLite but cannot fetch the
system sqlite3 binary. This executes SQL, never pretends a test passed.
"""
import sqlite3
import sys


def main():
    if len(sys.argv) not in (2, 3) or sys.argv[1].startswith('-'):
        raise SystemExit('USAGE: sqlite3 DATABASE [SQL]')
    sql = sys.argv[2] if len(sys.argv) == 3 else sys.stdin.read()
    if not sql.strip() or sql.lstrip().startswith('.'):
        raise SystemExit('SQL_REQUIRED; dot-commands are unsupported')
    with sqlite3.connect(sys.argv[1]) as conn:
        if len(sys.argv) == 3:
            cursor = conn.execute(sql)
            if cursor.description:
                for row in cursor:
                    print('|'.join('' if value is None else str(value) for value in row))
        else:
            conn.executescript(sql)


if __name__ == '__main__':
    try:
        main()
    except sqlite3.Error as exc:
        print(f'SQLITE_CI_ERROR:{type(exc).__name__}', file=sys.stderr)
        raise SystemExit(1)
