
[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mMissing required argument: output[0m


wrangler d1 export <name>

Export the contents or schema of your database as a .sql file

POSITIONALS
  name  The name of the DB  [string] [required]

GLOBAL FLAGS
  -c, --config    Path to Wrangler configuration file  [string]
      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
  -h, --help      Show help  [boolean]
  -v, --version   Show version number  [boolean]

OPTIONS
      --local      Export from your local DB you use with wrangler dev  [boolean]
      --remote     Export from your live D1  [boolean]
      --no-schema  Only output table contents, not the DB schema  [boolean]
      --no-data    Only output table schema, not the contents of the DBs themselves  [boolean]
      --table      Specify which tables to include in export  [string]
      --output     Which .sql file to output to  [string] [required]
🪵  Logs were written to "/Users/filipedaumas/Library/Preferences/.wrangler/logs/wrangler-2025-11-02_16-04-16_670.log"
