#!/bin/bash
set -e

rm -rf "$PWD/dist"
babel src --out-dir dist --ignore '**/*-unit.js' --source-maps inline
