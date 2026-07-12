#!/usr/bin/env python3

import argparse
import copy
import sys
import tomllib
from pathlib import Path
from typing import Any


def fail(message: str) -> "NoReturn":
    print(message, file=sys.stderr)
    raise SystemExit(1)


def merge_dicts(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in overlay.items():
        current = merged.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            merged[key] = merge_dicts(current, value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def resolve_effective_staging_target(config: dict[str, Any]) -> dict[str, Any]:
    root = {key: value for key, value in config.items() if key != "env"}
    envs = config.get("env")

    if envs is None:
        return root

    if not isinstance(envs, dict):
        fail("Invalid TOML: top-level [env] must be a table.")

    staging = envs.get("staging")
    if not isinstance(staging, dict) or not staging:
        fail("Invalid staging target: [env.staging] is missing or empty.")

    return merge_dicts(root, staging)


def collect_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        strings: list[str] = []
        for item in value:
            strings.extend(collect_strings(item))
        return strings
    if isinstance(value, dict):
        strings = []
        for item in value.values():
            strings.extend(collect_strings(item))
        return strings
    return []


def expect_equal(actual: Any, expected: Any, message: str) -> None:
    if actual != expected:
        fail(f"{message} Expected {expected!r}, got {actual!r}.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the effective Wrangler staging deployment target without scanning unused TOML blocks."
    )
    parser.add_argument("--config", required=True)
    parser.add_argument("--allowed-worker-name", required=True)
    parser.add_argument("--blocked-production-worker-name", required=True)
    parser.add_argument("--allowed-db-name", required=True)
    parser.add_argument("--allowed-db-id", required=True)
    parser.add_argument("--blocked-production-db-id", required=True)
    parser.add_argument("--allowed-bucket-name", required=True)
    parser.add_argument("--blocked-production-bucket-name", required=True)
    parser.add_argument("--blocked-production-host", required=True)
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.is_file():
        fail(f"Config file not found: {config_path}")

    with config_path.open("rb") as handle:
        config = tomllib.load(handle)

    effective = resolve_effective_staging_target(config)

    worker_name = effective.get("name")
    if not isinstance(worker_name, str) or not worker_name:
        fail("Invalid staging target: worker name is missing.")
    if worker_name == args.blocked_production_worker_name:
        fail("Blocked production target: worker name resolves to production.")
    expect_equal(worker_name, args.allowed_worker_name, "Invalid staging target: worker name mismatch.")

    vars_block = effective.get("vars")
    if not isinstance(vars_block, dict):
        fail("Invalid staging target: [vars] block is missing.")

    environment = vars_block.get("ENVIRONMENT")
    if not isinstance(environment, str) or not environment:
        fail("Invalid staging target: vars.ENVIRONMENT is missing.")
    if environment == "production":
        fail("Blocked production target: vars.ENVIRONMENT resolves to production.")
    expect_equal(environment, "staging", "Invalid staging target: vars.ENVIRONMENT mismatch.")

    app_env = vars_block.get("APP_ENV")
    if app_env is not None and app_env != "staging":
        fail(f"Invalid staging target: vars.APP_ENV must be 'staging' when present. Got {app_env!r}.")

    d1_bindings = effective.get("d1_databases")
    if not isinstance(d1_bindings, list) or not d1_bindings:
        fail("Invalid staging target: d1_databases is missing or empty.")

    db_binding = next(
        (binding for binding in d1_bindings if isinstance(binding, dict) and binding.get("binding") == "DB"),
        None,
    )
    if not isinstance(db_binding, dict):
        fail("Invalid staging target: DB binding is missing from d1_databases.")

    if db_binding.get("database_id") == args.blocked_production_db_id:
        fail("Blocked production target: staging DB binding resolves to the production database ID.")
    expect_equal(db_binding.get("database_name"), args.allowed_db_name, "Invalid staging target: DB name mismatch.")
    expect_equal(db_binding.get("database_id"), args.allowed_db_id, "Invalid staging target: DB ID mismatch.")

    r2_bindings = effective.get("r2_buckets")
    if not isinstance(r2_bindings, list) or not r2_bindings:
        fail("Invalid staging target: r2_buckets is missing or empty.")

    bucket_binding = next(
        (binding for binding in r2_bindings if isinstance(binding, dict) and binding.get("binding") == "BUCKET"),
        None,
    )
    if not isinstance(bucket_binding, dict):
        fail("Invalid staging target: BUCKET binding is missing from r2_buckets.")

    bucket_name = bucket_binding.get("bucket_name")
    preview_bucket_name = bucket_binding.get("preview_bucket_name")
    if bucket_name == args.blocked_production_bucket_name or preview_bucket_name == args.blocked_production_bucket_name:
        fail("Blocked production target: staging bucket binding resolves to the production bucket.")
    expect_equal(bucket_name, args.allowed_bucket_name, "Invalid staging target: R2 bucket mismatch.")
    expect_equal(
        preview_bucket_name,
        args.allowed_bucket_name,
        "Invalid staging target: R2 preview bucket mismatch.",
    )

    effective_strings = collect_strings(effective)
    exact_blocked_tokens = {
        args.blocked_production_db_id: "production database ID",
        args.blocked_production_worker_name: "production worker name",
        args.blocked_production_bucket_name: "production R2 bucket",
    }
    for token, label in exact_blocked_tokens.items():
        if token in effective_strings:
            fail(f"Blocked production target: effective staging config still references the {label}.")

    if any(args.blocked_production_host in value for value in effective_strings):
        fail("Blocked production target: effective staging config still references the production API host.")

    print(
        f"Staging deployment target validated: worker={worker_name}, db={db_binding['database_id']}, bucket={bucket_name}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
