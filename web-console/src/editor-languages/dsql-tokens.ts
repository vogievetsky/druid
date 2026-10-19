/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { InputStream, Stack } from '@lezer/lr';
import { ContextTracker } from '@lezer/lr';
import { dedupe } from 'druid-query-toolkit';

import type { AvailableFunctions } from '../helpers';

import {
  BlockComment,
  Constant,
  FunctionName,
  Identifier,
  Issue,
  Keyword,
  LineComment,
  TypeName,
} from './dsql.parser.terms';
import { SQL_DATA_TYPES, SQL_FUNCTIONS } from './dsql-docs';
import { SQL_CONSTANTS, SQL_DYNAMICS, SQL_KEYWORDS } from './dsql-keywords';
import type { PipeContext } from './dsql-pipe-syntax';
import { isPipeKeyword, nextPipeContext, START_PIPE_CONTEXT } from './dsql-pipe-syntax';

const WORD_TERMS = new Set([Keyword, FunctionName, Constant, TypeName, Identifier]);
const COMMENT_TERMS = new Set([Issue, LineComment, BlockComment]);

// The next characters of the input
function readInput(input: InputStream, length: number): string {
  let text = '';
  for (let offset = 0; offset < length; offset++) text += String.fromCharCode(input.peek(offset));
  return text;
}

/**
 * Keeps track of where the parser is in the pipe operators (the pipe context), for the specializer
 */
export const trackPipeContext = new ContextTracker<PipeContext>({
  start: START_PIPE_CONTEXT,
  shift: (context, term, stack, input) => {
    if (COMMENT_TERMS.has(term)) return context;
    // The token goes from the position of the input to the position of the stack. Other than words, only short tokens
    // (the pipe symbol, parentheses and semicolons) are told apart by their text.
    const isWord = WORD_TERMS.has(term);
    const length = stack.pos - input.pos;
    const text = readInput(input, isWord ? length : Math.min(length, 3));
    if (!text.trim()) return context; // Spaces
    return nextPipeContext(context, text, isWord);
  },
  // The parser only reuses the nodes of an earlier parse that start in a context with the same hash
  hash: context => context.hash,
});

/**
 * Turns an identifier into a keyword, function, constant or type (by giving the id of that term), or leaves it as an
 * identifier (-1). This is the signature of a Lezer external specializer, the parse stack has the pipe context.
 */
export type IdentifierSpecializer = (value: string, stack?: Stack) => number;

/**
 * Makes the specializer that knows the documented words and the given functions that the cluster has (matched
 * ignoring case)
 */
export function makeIdentifierSpecializer(
  availableSqlFunctions: AvailableFunctions | undefined,
): IdentifierSpecializer {
  let words: Map<string, number> | undefined;
  const getWords = () => {
    if (words) return words;

    // A word that is in several lists is the term of the last one
    const termLists: [number, string[]][] = [
      [
        FunctionName,
        dedupe([
          ...SQL_DYNAMICS,
          ...Array.from(SQL_FUNCTIONS.keys()),
          ...(availableSqlFunctions?.keys() || []),
        ]),
      ],
      [Keyword, SQL_KEYWORDS.flatMap(k => k.split(/\s/g))], // Some keywords are like "EXPLAIN PLAN FOR"
      [Constant, SQL_CONSTANTS],
      [TypeName, Array.from(SQL_DATA_TYPES.keys())],
    ];

    words = new Map();
    for (const [term, termWords] of termLists) {
      for (const word of termWords) words.set(word.toLowerCase(), term);
    }
    return words;
  };

  return (value, stack) => {
    // The words of pipe syntax are keywords in their place in a pipe operator, and only there
    if (stack && isPipeKeyword(stack.context, value)) return Keyword;
    return getWords().get(value.toLowerCase()) ?? -1;
  };
}

/**
 * The specializer that the grammar refers to, it knows the documented words. `getDsqlLanguage` replaces it with one
 * that also knows the functions that the cluster has.
 */
export const specializeIdentifier: IdentifierSpecializer = makeIdentifierSpecializer(undefined);
