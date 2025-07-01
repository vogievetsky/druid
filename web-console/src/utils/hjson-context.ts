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

export interface HjsonContext {
  /**
   * The path of keys leading to the current position, e.g., ["query", "dataSource"]
   * For arrays, includes the index as a string key, e.g., ["filters", "0", "dimension"]
   * Empty array if at root level
   */
  path: string[];

  /**
   * If editing a value (isEditingKey === false), this is the key for that value
   * If editing a key (isEditingKey === true), this is undefined
   */
  currentKey?: string;

  /**
   * Whether the cursor is positioned where a key should be entered (true)
   * or where a value should be entered (false)
   */
  isEditingKey: boolean;

  /**
   * Whether the cursor is positioned inside a comment (single-line or multi-line)
   */
  isEditingComment: boolean;

  /**
   * The parsed JSON object representing everything parsed so far.
   * This includes partial keys and values being typed.
   */
  parsedObject: any;
}

/**
 * Analyzes an Hjson string (from start to cursor position) and returns
 * context information about where the cursor is positioned within the JSON structure
 *
 * @param hjson - The Hjson text from the beginning of the document to the cursor position
 * @returns Context information about the cursor position
 */
export function getHjsonContext(hjson: string): HjsonContext {
  // Empty input
  if (!hjson.trim()) {
    return {
      path: [],
      currentKey: undefined,
      isEditingKey: true,
      isEditingComment: false,
      parsedObject: {},
    };
  }

  // State machine state
  const path: string[] = [];
  const parsedObject = undefined;

  let state:
    | 'normal'
    | 'quoted-string'
    | 'single-line-comment'
    | 'multi-line-comment'
    | 'multiline-string'
    | 'key'
    | 'value' = 'normal';
  let stringDelim: string | undefined;
  let currentStringValue: string | undefined;
  let currentKey: string | undefined;

  // Process each character
  for (let i = 0; i < hjson.length; i++) {
    const ch = hjson[i];
    const next = hjson[i + 1];

    // State transitions
    if (state === 'single-line-comment') {
      if (ch === '\n') state = 'normal';
      continue;
    }

    if (state === 'multi-line-comment') {
      if (ch === '*' && next === '/') {
        state = 'normal';
        i++; // Skip '/'
      }
      continue;
    }

    if (state === 'quoted-string') {
      if (ch === stringDelim && hjson[i - 1] !== '\\') {
        // ToDo: store string as needed

        currentStringValue = undefined;
        stringDelim = undefined;
        state = 'normal';
      } else {
        currentStringValue += ch;
      }
      continue;
    }

    if (state === 'multiline-string') {
      if (ch === "'" && next === "'" && hjson[i + 2] === "'") {
        // End of multiline string
        i += 2; // Skip the other two quotes

        // ToDo: store string as needed
        currentStringValue = undefined;
        state = 'normal';
      } else {
        currentStringValue += ch;
      }
      continue;
    }

    // Normal state processing

    // Check for comment start
    if (ch === '#') {
      state = 'single-line-comment';
      continue;
    }

    if (ch === '/' && next === '/') {
      state = 'single-line-comment';
      i++; // Skip second '/'
      continue;
    }

    if (ch === '/' && next === '*') {
      state = 'multi-line-comment';
      i++; // Skip '*'
      continue;
    }

    // Check for multiline string start
    if (ch === "'" && next === "'" && hjson[i + 2] === "'") {
      i += 2; // Skip the other two quotes
      currentStringValue = ''; // Don't include the triple quotes
      state = 'multiline-string';
      continue;
    }

    // String start
    if (ch === '"' || ch === "'") {
      stringDelim = ch;
      currentStringValue = '';
      state = 'quoted-string';
      continue;
    }

    // Structural characters
    switch (ch) {
      case '{': {
        // ToDo: fill this
        break;
      }

      case '[': {
        // ToDo: fill this
        break;
      }

      case '}':
      case ']': {
        // ToDo: fill this
        break;
      }

      case ':': {
        // ToDo: fill this
        break;
      }

      case ',': {
        // ToDo: fill this
        break;
      }

      default: {
        // ToDo: fill this
        break;
      }
    }
  }

  return {
    path,
    currentKey,
    isEditingKey: state === 'key',
    isEditingComment: state === 'single-line-comment' || state === 'multi-line-comment',
    parsedObject,
  };
}
