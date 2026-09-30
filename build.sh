#!/bin/bash
# usage: build.sh [test]  — concatenates parts into octopus-jar.html (or test.html with "test")
cd "$(dirname "$0")/parts"
OUT=../octopus-jar.html
[ "$1" = "test" ] && OUT=../test.html
{
  cat p00_head.html
  for f in p01_core.js p02_room.js p03_jar.js p04_lid.js p05_octopus.js p06_arms.js p07a_behavior.js p07b_behavior.js p07c_behavior.js p08_main.js; do
    [ -f "$f" ] && cat "$f"
  done
  [ "$1" = "test" ] && cat p91_dbg.js
  cat p99_tail.html
} > "$OUT"
echo "built $OUT ($(wc -c < "$OUT") bytes)"
