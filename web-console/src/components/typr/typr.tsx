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

import { useEffect, useRef, useState } from 'react';

import {
  getCursorPositionInContentEditable,
  setCursorPositionInContentEditable,
} from './cursor-utils';
import {
  parseTokens,
  removeTokenByIndex,
  tokensToExpression,
  tokensToString,
  tokenToHtml,
} from './token-utils';

import './typr.scss';

export const Typr = function Typr() {
  const divRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('hello world x=moon');

  console.log(tokensToExpression(parseTokens(text)).toString());

  const handleInput = () => {
    if (divRef.current) {
      console.log('Content:', divRef.current.innerText); // Capture the content
      setText(divRef.current.innerText);
    }
  };

  useEffect(() => {
    const cont = divRef.current;
    if (!cont) return;

    const tokens = parseTokens(text);
    const position = getCursorPositionInContentEditable(cont);
    cont.innerHTML = tokens.map(tokenToHtml).join('') + ' ';
    setCursorPositionInContentEditable(cont, position);
  }, [text]);

  return (
    <div
      className="typr"
      ref={divRef}
      contentEditable="plaintext-only"
      onInput={handleInput}
      onClick={e => {
        const target = e.target as HTMLElement;
        if (target.className === 'closer') {
          const index = target.getAttribute('data-term-index');
          if (typeof index === 'string') {
            const i = Number(index);
            console.log('remove index', i);
            const tokens = parseTokens(text);
            setText(tokensToString(removeTokenByIndex(tokens, i)));
            return;
          }
        }
        console.log('Click on', e.target);
      }}
    />
  );
};
