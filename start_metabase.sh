#!/bin/bash
echo "Starting Metabase BI Server..."
if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  if [ -x "/opt/homebrew/opt/openjdk/bin/java" ]; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  else
    echo "Java is not installed. Install with: brew install openjdk"
    exit 1
  fi
fi
if [ ! -f metabase.jar ]; then
  echo "Downloading Metabase (this may take a minute)..."
  curl -L https://downloads.metabase.com/v0.47.0/metabase.jar -o metabase.jar
fi
MB_DB_FILE=./metabase.db java -jar metabase.jar
