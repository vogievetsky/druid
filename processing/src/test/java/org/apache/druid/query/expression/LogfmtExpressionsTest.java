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

package org.apache.druid.query.expression;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import org.apache.druid.jackson.DefaultObjectMapper;
import org.apache.druid.math.expr.Expr;
import org.apache.druid.math.expr.ExprEval;
import org.apache.druid.math.expr.ExprMacroTable;
import org.apache.druid.math.expr.ExpressionType;
import org.apache.druid.math.expr.ExpressionValidationException;
import org.apache.druid.math.expr.InputBindings;
import org.apache.druid.math.expr.Parser;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.util.Map;

public class LogfmtExpressionsTest
{
  private static final ObjectMapper JSON_MAPPER = new DefaultObjectMapper();
  
  private ExprMacroTable macroTable;
  private Expr.ObjectBinding inputBindings;

  @Before
  public void setup()
  {
    macroTable = new ExprMacroTable(
        ImmutableList.of(
            new LogfmtExpressions.ParseLogfmtExprMacro(),
            new LogfmtExpressions.TryParseLogfmtExprMacro()
        )
    );
    
    inputBindings = InputBindings.forMap(ImmutableMap.of());
  }

  @Test
  public void testParseLogfmtNull()
  {
    Expr expr = Parser.parse("parse_logfmt(null)", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Assert.assertNull(eval.value());
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtSimpleKeyValue() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('key=value')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Assert.assertEquals("{\"key\":\"value\"}", JSON_MAPPER.writeValueAsString(eval.value()));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtMultipleKeyValues() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('foo=bar baz=qux')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals("bar", result.get("foo"));
    Assert.assertEquals("qux", result.get("baz"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtBooleanValues() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('enabled=true disabled=false')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals(Boolean.TRUE, result.get("enabled"));
    Assert.assertEquals(Boolean.FALSE, result.get("disabled"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtFlags() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('debug verbose')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals(Boolean.TRUE, result.get("debug"));
    Assert.assertEquals(Boolean.TRUE, result.get("verbose"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtQuotedString() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('msg=\"hello world\"')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals("hello world", result.get("msg"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtNumbersAsStrings() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('count=123 ratio=45.67')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals("123", result.get("count"));
    Assert.assertEquals("45.67", result.get("ratio"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtEmptyValue() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('key=')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertNull(result.get("key"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtEscapedQuotes() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('msg=\"She said \\\\\"Hello\\\\\"\"')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals("She said \"Hello\"", result.get("msg"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtComplexMixed() throws JsonProcessingException
  {
    String logfmt = "level=info msg=\"Request completed\" status=200 duration=45.3 success=true error=";
    Expr expr = Parser.parse("parse_logfmt('" + logfmt + "')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    
    Assert.assertEquals("info", result.get("level"));
    Assert.assertEquals("Request completed", result.get("msg"));
    Assert.assertEquals("200", result.get("status"));
    Assert.assertEquals("45.3", result.get("duration"));
    Assert.assertEquals(Boolean.TRUE, result.get("success"));
    Assert.assertNull(result.get("error"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtInvalidThrows()
  {
    // Test that non-string input causes an exception
    // The error happens during eval, not parse, since the expression needs to evaluate the argument first
    Assert.assertThrows(ExpressionValidationException.class, () -> {
      Expr expr = Parser.parse("parse_logfmt(123)", macroTable);
      // Need to flatten to trigger validation
      expr = Parser.flatten(expr);
    });
  }

  @Test
  public void testTryParseLogfmtNull()
  {
    Expr expr = Parser.parse("try_parse_logfmt(null)", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Assert.assertNull(eval.value());
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testTryParseLogfmtSimpleKeyValue() throws JsonProcessingException
  {
    Expr expr = Parser.parse("try_parse_logfmt('key=value')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Assert.assertEquals("{\"key\":\"value\"}", JSON_MAPPER.writeValueAsString(eval.value()));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testTryParseLogfmtNonString()
  {
    // try_parse_logfmt should return null for non-string input
    Expr expr = Parser.parse("try_parse_logfmt(123)", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Assert.assertNull(eval.value());
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testTryParseLogfmtEmptyString() throws JsonProcessingException
  {
    Expr expr = Parser.parse("try_parse_logfmt('')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertNotNull(result);
    Assert.assertEquals(0, result.size());
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testTryParseLogfmtComplexString() throws JsonProcessingException
  {
    String logfmt = "app=myapp version=1.0.0 env=production debug";
    Expr expr = Parser.parse("try_parse_logfmt('" + logfmt + "')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    
    Assert.assertEquals("myapp", result.get("app"));
    Assert.assertEquals("1.0.0", result.get("version"));
    Assert.assertEquals("production", result.get("env"));
    Assert.assertEquals(Boolean.TRUE, result.get("debug"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtWithSpecialCharacters() throws JsonProcessingException
  {
    Expr expr = Parser.parse("try_parse_logfmt('user.name=john request-id=123 meta_data=test')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    
    Assert.assertEquals("john", result.get("user.name"));
    Assert.assertEquals("123", result.get("request-id"));
    Assert.assertEquals("test", result.get("meta_data"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtLargeNumber() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('id=90071992547409934')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    // Should preserve as string, not lose precision
    Assert.assertEquals("90071992547409934", result.get("id"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }

  @Test
  public void testParseLogfmtWithEquals() throws JsonProcessingException
  {
    Expr expr = Parser.parse("parse_logfmt('url=\"http://example.com?foo=bar\"')", macroTable);
    ExprEval eval = expr.eval(inputBindings);
    Map<String, Object> result = (Map<String, Object>) eval.value();
    Assert.assertEquals("http://example.com?foo=bar", result.get("url"));
    Assert.assertEquals(ExpressionType.NESTED_DATA, eval.type());
  }
}
