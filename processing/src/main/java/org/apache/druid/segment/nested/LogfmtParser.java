/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.apache.druid.segment.nested;

import java.util.HashMap;
import java.util.Map;

/**
 * Parser for logfmt format strings.
 * 
 * Logfmt is a key-value format where:
 * - Key-value pairs are separated by spaces
 * - Values can be quoted with double quotes
 * - Keys without values are treated as boolean flags (value=true)
 * - Special values "true" and "false" are converted to booleans
 * - Empty unquoted values are converted to null
 * - Numbers remain as strings (unlike JSON)
 */
public class LogfmtParser
{
  /**
   * Parse a logfmt string into a Map of key-value pairs.
   * 
   * @param line the logfmt string to parse
   * @return a Map containing the parsed key-value pairs
   * @throws LogfmtParseException if the input is malformed
   */
  public static Map<String, Object> parse(String line) throws LogfmtParseException
  {
    if (line == null) {
      return null;
    }

    Map<String, Object> result = new HashMap<>();
    ParserState state = new ParserState();
    
    // Remove trailing newline if present
    if (line.endsWith("\n")) {
      line = line.substring(0, line.length() - 1);
    }
    
    for (int i = 0; i <= line.length(); i++) {
      char c = i < line.length() ? line.charAt(i) : '\0';
      
      // Handle end of input or space delimiter (when not in quotes)
      if ((c == ' ' && !state.inQuote) || i == line.length()) {
        if (state.inKey && state.key.length() > 0) {
          // Key without value becomes boolean true
          result.put(state.key.toString(), true);
          state.reset();
        } else if (state.inValue) {
          // Process the accumulated value
          Object processedValue = processValue(state.value.toString(), state.hadQuote);
          result.put(state.key.toString(), processedValue);
          state.reset();
        }
        
        if (i == line.length()) {
          break;
        }
        continue;
      }
      
      // Handle equals sign (key-value separator)
      if (c == '=' && !state.inQuote) {
        state.inKey = false;
        state.inValue = true;
        continue;
      }
      
      // Handle escape sequences
      if (c == '\\' && i + 1 < line.length()) {
        i++;
        char escaped = line.charAt(i);
        char actualChar = escaped;
        
        // Handle special escape sequences
        switch (escaped) {
          case 'n':
            actualChar = '\n';
            break;
          case 't':
            actualChar = '\t';
            break;
          case 'r':
            actualChar = '\r';
            break;
          case '\\':
            actualChar = '\\';
            break;
          case '"':
            actualChar = '"';
            break;
          case '\'':
            actualChar = '\'';
            break;
          default:
            // For any other character, just use it as is
            actualChar = escaped;
        }
        
        if (state.inValue) {
          state.value.append(actualChar);
        } else if (state.inKey) {
          state.key.append(actualChar);
        }
        continue;
      }
      
      // Handle quotes
      if (c == '"') {
        state.hadQuote = true;
        state.inQuote = !state.inQuote;
        continue;
      }
      
      // Start a new key if not currently parsing
      if (c != ' ' && !state.inValue && !state.inKey) {
        state.inKey = true;
        state.key.append(c);
        continue;
      }
      
      // Accumulate characters
      if (state.inKey) {
        state.key.append(c);
      } else if (state.inValue) {
        state.value.append(c);
      }
    }
    
    return result;
  }
  
  /**
   * Process a value string according to logfmt rules.
   */
  private static Object processValue(String value, boolean hadQuote)
  {
    // Boolean values
    if ("true".equals(value)) {
      return Boolean.TRUE;
    }
    if ("false".equals(value)) {
      return Boolean.FALSE;
    }
    
    // Empty unquoted value becomes null
    if (value.isEmpty() && !hadQuote) {
      return null;
    }
    
    // All other values remain as strings (including numbers)
    return value;
  }
  
  /**
   * Internal state for the parser.
   */
  private static class ParserState
  {
    StringBuilder key = new StringBuilder();
    StringBuilder value = new StringBuilder();
    boolean inKey = false;
    boolean inValue = false;
    boolean inQuote = false;
    boolean hadQuote = false;
    
    void reset()
    {
      key.setLength(0);
      value.setLength(0);
      inKey = false;
      inValue = false;
      inQuote = false;
      hadQuote = false;
    }
  }
}
