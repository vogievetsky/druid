# Logfmt Parser Implementation Plan for Apache Druid

## Overview
Implement PARSE_LOGFMT and TRY_PARSE_LOGFMT functions in Apache Druid that mirror the existing PARSE_JSON and TRY_PARSE_JSON functions. These functions will parse logfmt-formatted strings into nested data structures compatible with Druid's existing nested data support.

## Logfmt Format Specification
Based on the JavaScript implementation, logfmt is a key-value format with the following rules:
- Key-value pairs separated by spaces: `key1=value1 key2=value2`
- Values can be quoted with double quotes: `key="value with spaces"`
- Boolean flags (keys without values): `flag` → `{flag: true}`
- Boolean values: `key=true` → `{key: true}`, `key=false` → `{key: false}`
- Null values: `key=` → `{key: null}` (empty unquoted value)
- Escape sequences supported within values: `key="value with \"quotes\""`
- Numbers remain as strings (unlike JSON): `key=123` → `{key: "123"}`

## Implementation Components

### 1. Core Logfmt Parser
**Location:** `processing/src/main/java/org/apache/druid/segment/nested/LogfmtParser.java`

**Class Structure:**
```java
public class LogfmtParser {
  public static Map<String, Object> parse(String line) throws LogfmtParseException
  private static class ParserState
}
```

**Key Methods:**
- `parse(String line)`: Main parsing method that returns a Map<String, Object>
- State machine implementation tracking:
  - Current position in string
  - Whether in key/value parsing mode
  - Quote handling state
  - Escape sequence handling

**Parsing Algorithm (from JavaScript):**
1. Initialize empty result map and parsing state
2. Iterate through each character:
   - Handle space delimiters (when not in quotes)
   - Handle `=` as key-value separator
   - Handle `"` for quote toggling
   - Handle `\` for escape sequences
   - Build keys and values character by character
3. Post-process values:
   - Convert "true"/"false" strings to boolean
   - Convert empty unquoted values to null
   - Keep all other values as strings (including numbers)

### 2. Expression Macros
**Location:** `processing/src/main/java/org/apache/druid/query/expression/LogfmtExpressions.java`

**Classes to Implement:**
```java
public class LogfmtExpressions {
  public static class ParseLogfmtExprMacro implements ExprMacroTable.ExprMacro
  public static class TryParseLogfmtExprMacro implements ExprMacroTable.ExprMacro
}
```

**Implementation Pattern (mirror JSON versions):**
- `ParseLogfmtExprMacro`: Throws exception on invalid logfmt
- `TryParseLogfmtExprMacro`: Returns null on invalid logfmt
- Both return `ExpressionType.NESTED_DATA` type
- Use `LogfmtParser.parse()` instead of `ObjectMapper.readValue()`

### 3. SQL Operator Conversions
**Location:** `sql/src/main/java/org/apache/druid/sql/calcite/expression/builtin/LogfmtOperatorConversions.java`

**Classes to Implement:**
```java
public class LogfmtOperatorConversions {
  public static class ParseLogfmtOperatorConversion implements SqlOperatorConversion
  public static class TryParseLogfmtOperatorConversion implements SqlOperatorConversion
}
```

**Implementation Pattern:**
- Mirror structure of `ParseJsonOperatorConversion` and `TryParseJsonOperatorConversion`
- Function names: "parse_logfmt" and "try_parse_logfmt"
- SQL function names: "PARSE_LOGFMT" and "TRY_PARSE_LOGFMT"
- Return type: NESTED_DATA

### 4. Registration and Wiring

#### 4.1 Expression Module Registration
**File:** `processing/src/main/java/org/apache/druid/guice/ExpressionModule.java`
- Add `LogfmtExpressions.ParseLogfmtExprMacro.class`
- Add `LogfmtExpressions.TryParseLogfmtExprMacro.class`

#### 4.2 SQL Operator Table Registration
**File:** `sql/src/main/java/org/apache/druid/sql/calcite/planner/DruidOperatorTable.java`
- Add `new LogfmtOperatorConversions.ParseLogfmtOperatorConversion()`
- Add `new LogfmtOperatorConversions.TryParseLogfmtOperatorConversion()`

### 5. Test Implementation

#### 5.1 Core Parser Tests
**Location:** `processing/src/test/java/org/apache/druid/segment/nested/LogfmtParserTest.java`

**Test Cases (from JavaScript):**
- Simple flag parsing: `"hello"` → `{hello: true}`
- Simple key-value: `"hello=kitty"` → `{hello: "kitty"}`
- Boolean values: `"foo=true bar=false"` → `{foo: true, bar: false}`
- Number strings: `"foo=123 bar=456.789"` → `{foo: "123", bar: "456.789"}`
- Large numbers: `"thing=90071992547409934"` → `{thing: "90071992547409934"}`
- Escaped strings: `"hello=\"'kitty'\""` → `{hello: "'kitty'"}`
- Equals in values: `"foo=\"hello=kitty\""` → `{foo: "hello=kitty"}`
- Complex mixed format (readme example)
- Edge cases:
  - Empty string
  - Null values
  - Whitespace handling
  - Invalid escape sequences

#### 5.2 Expression Macro Tests
**Location:** `processing/src/test/java/org/apache/druid/query/expression/LogfmtExpressionsTest.java`

**Test Cases:**
- `parse_logfmt(null)` → null
- `parse_logfmt('key=value')` → nested data with {key: "value"}
- `parse_logfmt('invalid{')` → exception
- `try_parse_logfmt('invalid{')` → null
- Various format combinations
- Integration with other nested data functions

#### 5.3 SQL Integration Tests
**Location:** `sql/src/test/java/org/apache/druid/sql/calcite/CalciteLogfmtQueryTest.java`

**Test Cases:**
- Basic SQL queries using PARSE_LOGFMT
- TRY_PARSE_LOGFMT with invalid input
- Combination with JSON_VALUE for field extraction
- Performance comparison with PARSE_JSON

### 6. Documentation Updates

#### 6.1 SQL Functions Documentation
**File:** `docs/querying/sql-functions.md`
- Add PARSE_LOGFMT and TRY_PARSE_LOGFMT to function list
- Include examples and use cases

#### 6.2 SQL JSON Functions Documentation  
**File:** `docs/querying/sql-json-functions.md`
- Add section for logfmt parsing functions
- Explain differences from JSON parsing

#### 6.3 Nested Columns Documentation
**File:** `docs/querying/nested-columns.md`
- Add examples using logfmt data

## Implementation Order

1. **Phase 1: Core Parser** ✅ COMPLETE
   - ✅ Implement `LogfmtParser` class
   - ✅ Write `LogfmtParserTest` with all test cases (26 test cases)
   - ✅ Ensure parser handles all edge cases correctly

2. **Phase 2: Expression Layer** ✅ COMPLETE
   - ✅ Implement `LogfmtExpressions` with both macros (ParseLogfmtExprMacro, TryParseLogfmtExprMacro)
   - ✅ Write `LogfmtExpressionsTest` (19 test cases)
   - ✅ Register in `ExpressionModule`

3. **Phase 3: SQL Layer** ✅ COMPLETE
   - ✅ Implement `LogfmtOperatorConversions` (ParseLogfmtOperatorConversion, TryParseLogfmtOperatorConversion)
   - ✅ Register in `DruidOperatorTable`
   - ✅ Write `CalciteLogfmtQueryTest` (9 test cases for SQL integration)

4. **Phase 4: Integration Testing**
   - End-to-end testing with real data
   - Performance testing
   - Documentation updates

## Key Design Decisions

1. **Number Handling**: Unlike JSON, logfmt keeps numbers as strings. This maintains compatibility with the format specification and avoids precision loss for large numbers.

2. **Null Handling**: Empty unquoted values become null, maintaining semantic meaning from the original format.

3. **Error Handling**: Following the JSON pattern with separate PARSE (throws exceptions) and TRY_PARSE (returns null) functions.

4. **Return Type**: Using `ExpressionType.NESTED_DATA` to maintain compatibility with existing nested data operations.

5. **No Nested Structure Support**: Logfmt is inherently flat, so the parser returns a single-level Map structure.

## Testing Strategy

1. **Unit Tests**: Test parser logic in isolation
2. **Expression Tests**: Test integration with Druid's expression system
3. **SQL Tests**: Test SQL function behavior
4. **Integration Tests**: Test with real queries and data
5. **Performance Tests**: Compare with JSON parsing performance
6. **Edge Case Tests**: Malformed input, empty strings, special characters

## Success Criteria

- [x] All JavaScript test cases pass when converted to Java (Phase 1 complete)
- [x] Functions behave identically to PARSE_JSON/TRY_PARSE_JSON except for format (Phase 2 complete)
- [x] SQL queries work correctly with logfmt data (Phase 3 complete - SQL functions registered and functional)
- [ ] Documentation is complete and includes examples
- [x] Code follows Druid coding standards and patterns (All phases pass checks)
- [x] All tests pass including checkstyle, spotbugs, and forbidden APIs (All phases complete)