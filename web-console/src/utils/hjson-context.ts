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
  let parsedObject: any = {};

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

  // Additional state for tracking context
  let expectingKey = true;
  let expectingValue = false;
  let currentToken = '';
  const objectStack: any[] = [parsedObject];
  const keyStack: (string | undefined)[] = [];
  const isArrayStack: boolean[] = [false];
  const arrayIndexStack: number[] = [0];
  let lastNonWhitespaceChar = '';
  let colonSeen = false;

  // Helper function to get current object
  const getCurrentObject = () => objectStack[objectStack.length - 1];

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
        // Store the completed string
        if (expectingKey) {
          currentKey = currentStringValue;
          if (currentKey !== undefined) {
            getCurrentObject()[currentKey] = undefined;
          }
          // After a key, we expect a colon
          expectingKey = false;
          expectingValue = true;
        } else if (expectingValue && currentKey !== undefined) {
          getCurrentObject()[currentKey] = currentStringValue;
          currentKey = undefined;
          expectingKey = !colonSeen && !isArrayStack[isArrayStack.length - 1];
          expectingValue = false;
          colonSeen = false;
        }
        currentStringValue = undefined;
        stringDelim = undefined;
        state = 'normal';
        currentToken = '';
      } else {
        currentStringValue += ch;
      }
      continue;
    }

    if (state === 'multiline-string') {
      if (ch === "'" && next === "'" && hjson[i + 2] === "'") {
        // End of multiline string
        i += 2; // Skip the other two quotes
        if (expectingValue && currentKey !== undefined) {
          getCurrentObject()[currentKey] = currentStringValue;
          currentKey = undefined;
          expectingKey = true;
          expectingValue = false;
        }
        currentStringValue = undefined;
        state = 'normal';
      } else {
        currentStringValue += ch;
      }
      continue;
    }

    // Normal state processing

    // Skip whitespace before processing
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      // Special case for newlines in Hjson
      if (ch === '\n') {
        if (currentToken && expectingKey && lastNonWhitespaceChar !== ',' && lastNonWhitespaceChar !== '{') {
          // Hjson allows keys without quotes followed by newline
          currentKey = currentToken;
          getCurrentObject()[currentKey] = undefined;
          currentToken = '';
          expectingKey = true; // Still expecting next key
        } else if (!expectingKey && !expectingValue && lastNonWhitespaceChar !== ',') {
          // After a completed value without comma, newline means we expect a new key
          expectingKey = true;
          currentKey = undefined;
        }
      }
      continue;
    }

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
      // Check for syntax error: expecting colon after key but got another string
      // This should only happen if we just finished parsing a key string and haven't seen a colon
      // Don't apply this check in array context
      const inArray = isArrayStack[isArrayStack.length - 1];
      if (expectingValue && !colonSeen && currentKey !== undefined && state === 'normal' && !inArray) {
        throw new Error('Missing colon after key');
      }

      // Process any pending unquoted token before starting quoted string
      if (currentToken && expectingKey) {
        currentKey = currentToken;
        getCurrentObject()[currentKey] = undefined;
        currentToken = '';
      } else if (currentToken && expectingValue && currentKey !== undefined) {
        getCurrentObject()[currentKey] = currentToken;
        currentKey = undefined;
        expectingKey = true;
        expectingValue = false;
        currentToken = '';
      }

      stringDelim = ch;
      currentStringValue = '';
      state = 'quoted-string';
      continue;
    }

    // Structural characters
    switch (ch) {
      case '{': {
        // Process any pending token
        if (currentToken) {
          if (expectingKey) {
            currentKey = currentToken;
            getCurrentObject()[currentKey] = undefined;
          } else if (expectingValue && currentKey !== undefined) {
            // We're starting an object as a value
          }
          currentToken = '';
        }

        // If this is the root object or we have a key/array context, create new object
        if (
          objectStack.length === 1 ||
          currentKey !== undefined ||
          isArrayStack[isArrayStack.length - 1]
        ) {
          const newObj = {};

          if (currentKey !== undefined) {
            // Object as value of a property
            getCurrentObject()[currentKey] = newObj;
            path.push(currentKey);
          } else if (isArrayStack[isArrayStack.length - 1]) {
            // In array context
            const idx = arrayIndexStack[arrayIndexStack.length - 1];
            getCurrentObject()[idx] = newObj;
            path.push(String(idx));
            arrayIndexStack[arrayIndexStack.length - 1]++;
          }
          // else: root object - already handled by initialization

          if (
            objectStack.length > 1 ||
            currentKey !== undefined ||
            isArrayStack[isArrayStack.length - 1]
          ) {
            objectStack.push(newObj);
            keyStack.push(currentKey);
            isArrayStack.push(false);
            arrayIndexStack.push(0);
          }
        }

        currentKey = undefined;
        expectingKey = true;
        expectingValue = false;
        colonSeen = false;
        break;
      }

      case '[': {
        // Process any pending token
        if (currentToken) {
          if (expectingKey) {
            currentKey = currentToken;
            getCurrentObject()[currentKey] = undefined;
          }
          currentToken = '';
        }

        // Create new array
        const newArr: any[] = [];
        if (currentKey !== undefined) {
          getCurrentObject()[currentKey] = newArr;
          path.push(currentKey);
        } else if (path.length === 0) {
          // Root level array - treat as object
          parsedObject = {};
          objectStack[0] = parsedObject;
        }

        objectStack.push(newArr);
        keyStack.push(currentKey);
        isArrayStack.push(true);
        arrayIndexStack.push(0);
        currentKey = String(arrayIndexStack[arrayIndexStack.length - 1]);
        expectingKey = false;
        expectingValue = true;
        colonSeen = false;
        break;
      }

      case '}':
      case ']': {
        // Process any pending token
        if (currentToken) {
          if (expectingKey && ch === '}') {
            currentKey = currentToken;
            getCurrentObject()[currentKey] = undefined;
          } else if (expectingValue && currentKey !== undefined) {
            getCurrentObject()[currentKey] = currentToken;
          }
          currentToken = '';
        }

        // Pop from stacks
        if (objectStack.length > 1) {
          objectStack.pop();
          const poppedKey = keyStack.pop();
          isArrayStack.pop();
          arrayIndexStack.pop();
          if (poppedKey !== undefined && path.length > 0) {
            path.pop();
          }
        }

        // Reset state based on parent context
        const parentIsArray = isArrayStack[isArrayStack.length - 1];
        if (parentIsArray) {
          currentKey = String(arrayIndexStack[arrayIndexStack.length - 1]);
          expectingKey = false;
          expectingValue = true;
        } else {
          currentKey = undefined;
          expectingKey = false;  // After closing brace, we're not immediately expecting a key
          expectingValue = false;
        }
        colonSeen = false;
        break;
      }

      case ':': {
        // Process any pending token as key
        if (currentToken) {
          currentKey = currentToken;
          getCurrentObject()[currentKey] = undefined;
          currentToken = '';
        }

        expectingKey = false;
        expectingValue = true;
        colonSeen = true;
        break;
      }

      case ',': {
        // Process any pending token
        if (currentToken) {
          if (expectingKey) {
            // This shouldn't happen in valid JSON, but Hjson allows it
            currentKey = currentToken;
            getCurrentObject()[currentKey] = undefined;
          } else if (expectingValue && currentKey !== undefined) {
            getCurrentObject()[currentKey] = currentToken;
          }
          currentToken = '';
        }

        // After comma, we expect a new key (or next array element)
        const inArray = isArrayStack[isArrayStack.length - 1];
        if (inArray) {
          arrayIndexStack[arrayIndexStack.length - 1]++;
          currentKey = String(arrayIndexStack[arrayIndexStack.length - 1]);
          expectingKey = false;
          expectingValue = true;
        } else {
          currentKey = undefined;
          expectingKey = true;
          expectingValue = false;
        }
        colonSeen = false;
        break;
      }

      default: {
        // Build up unquoted token
        currentToken += ch;
        lastNonWhitespaceChar = ch;
        break;
      }
    }
  }

  // Process any final pending token
  if (currentToken) {
    if (expectingKey) {
      // Check if this is the first key in the object or a subsequent key
      const currentObj = getCurrentObject();
      const isFirstKey = Object.keys(currentObj).length === 0;

      if (isFirstKey) {
        // First key: add to parsedObject, currentKey stays undefined
        currentObj[currentToken] = undefined;
      } else {
        // Subsequent key: don't add to parsedObject, will be in currentKey
      }
    } else if (expectingValue && currentKey !== undefined) {
      getCurrentObject()[currentKey] = currentToken;
      // Don't clear currentKey here - we're still editing this value
    }
  }

  // Determine final state
  let isEditingKey = expectingKey;
  let finalCurrentKey = currentKey;

  // Special handling for unclosed strings
  if (state === 'quoted-string') {
    if (expectingKey) {
      isEditingKey = true;
      finalCurrentKey = undefined;
      if (currentStringValue) {
        getCurrentObject()[currentStringValue] = undefined;
      }
    } else {
      isEditingKey = false;
      finalCurrentKey = currentKey;
      if (currentKey !== undefined && currentStringValue !== undefined) {
        getCurrentObject()[currentKey] = currentStringValue;
      }
    }
  }

  // Handle array context
  const inArray = isArrayStack[isArrayStack.length - 1];
  if (inArray && !isEditingKey && finalCurrentKey === undefined) {
    finalCurrentKey = String(arrayIndexStack[arrayIndexStack.length - 1]);
  }

  // For incomplete keys being typed
  if (currentToken && isEditingKey) {
    // Check if this is the first key in the root object or not
    const isRootLevel = path.length === 0;
    const currentObj = getCurrentObject();
    const hasKeys = Object.keys(currentObj).filter(k => k !== currentToken).length > 0;

    if (!isRootLevel || hasKeys) {
      // In nested object or subsequent key in root: set currentKey to the token
      finalCurrentKey = currentToken;
    } else {
      // First key in root object: currentKey remains undefined
      finalCurrentKey = undefined;
    }
  }

  return {
    path,
    currentKey: finalCurrentKey,
    isEditingKey,
    isEditingComment: state === 'single-line-comment' || state === 'multi-line-comment',
    parsedObject,
  };
}
