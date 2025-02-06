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

import { C, F, L, SqlExpression } from 'druid-query-toolkit';

import { filterMap, oneOf } from '../../utils';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------------------------------------------------------------

export type Token =
  | { type: 'space' }
  | { type: 'term'; term: string }
  | { type: 'field'; key: string; value: string }
  | { type: 'op'; op: 'AND' | 'OR' | 'NOT' };

export function tokenToString(token: Token): string {
  switch (token.type) {
    case 'space':
      return ' ';

    case 'term':
      return token.term;

    case 'field':
      return `${token.key}=${token.value}`;

    case 'op':
      return token.op;
  }
}

export function tokensToString(tokens: Token[]): string {
  return tokens.map(tokenToString).join('');
}

export function removeTokenByIndex(tokens: readonly Token[], index: number): Token[] {
  const newTokens = tokens.slice();
  if (newTokens[index - 1]?.type === 'space') {
    newTokens.splice(index - 1, 2);
  } else if (newTokens[index + 1]?.type === 'space') {
    newTokens.splice(index, 2);
  } else {
    newTokens.splice(index, 1);
  }
  return newTokens;
}

export function tokenToHtml(token: Token, index: number): string {
  if (token.type === 'space') return '_';
  return `<span class="${token.type}" data-tooltip='Index: ${index}'>${
    token.type === 'field'
      ? `${escapeHtml(token.key)}<span class="eq">=</span>${escapeHtml(token.value)}`
      : escapeHtml(tokenToString(token))
  }${
    oneOf(token.type, 'term', 'field')
      ? `<span class="closer-cont"><span class="closer" data-term-index="${index}"></span></span>`
      : ''
  }</span>`;
}

export function parseTokens(text: string): Token[] {
  const parts = text.replace(/_+$/, '_').split('_'); // max on space at the end
  const tokens: Token[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) tokens.push({ type: 'space' });
    const part = parts[i];
    if (part) {
      if (part === 'AND' || part === 'OR' || part === 'NOT') {
        tokens.push({ type: 'op', op: part });
      } else {
        const eqs = part.split('=');
        tokens.push(
          eqs.length === 1
            ? { type: 'term', term: part }
            : { type: 'field', key: eqs[0], value: eqs.slice(1).join('=') },
        );
      }
    }
  }
  return tokens;
}

// -------------------------------

// type Syntax =
//   | {
//       type: 'and' | 'or';
//       children: [];
//     }
//   | { type: 'not'; child: [] }
//   | { type: 'term'; term: string }
//   | { type: 'field'; key: string; value: string };

function escapeRegex(string: string): string {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

const LOG_COLUMN = C('_log');
export function tokensToExpression(tokens: Token[]): SqlExpression {
  return SqlExpression.and(
    ...filterMap(tokens, token => {
      switch (token.type) {
        case 'term':
          return F('REGEXP_LIKE', LOG_COLUMN, `\\b${escapeRegex(token.term)}\\b`);

        case 'field':
          return C(token.key).equal(L(token.value));

        default:
          return;
      }
    }),
  );
}
