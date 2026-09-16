#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
