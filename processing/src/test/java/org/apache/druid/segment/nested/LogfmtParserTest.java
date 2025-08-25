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

import org.junit.Assert;
import org.junit.Test;

import java.util.Map;

public class LogfmtParserTest
{
  @Test
  public void testSimpleFlagParsing() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("hello");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals(Boolean.TRUE, result.get("hello"));
  }
  
  @Test
  public void testSimpleKeyValueParsing() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("hello=kitty");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("kitty", result.get("hello"));
  }
  
  @Test
  public void testBooleanParsing() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=true bar=false");
    Assert.assertEquals(2, result.size());
    Assert.assertEquals(Boolean.TRUE, result.get("foo"));
    Assert.assertEquals(Boolean.FALSE, result.get("bar"));
  }
  
  @Test
  public void testNumbersAsStrings() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=123 bar=456.789");
    Assert.assertEquals(2, result.size());
    Assert.assertEquals("123", result.get("foo"));
    Assert.assertEquals("456.789", result.get("bar"));
  }
  
  @Test
  public void testLargeNumberPrecision() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("thing=90071992547409934");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("90071992547409934", result.get("thing"));
  }
  
  @Test
  public void testStringWithEscapes() throws LogfmtParseException
  {
    // Test with quotes containing escaped quotes
    Map<String, Object> result = LogfmtParser.parse("hello=\"\\'kitty\\'\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("'kitty'", result.get("hello"));
    
    // Test without quotes but with escaped characters
    result = LogfmtParser.parse("hello=\\'kitty\\'");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("'kitty'", result.get("hello"));
  }
  
  @Test
  public void testStringWithEquals() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=\"hello=kitty\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("hello=kitty", result.get("foo"));
  }
  
  @Test
  public void testComplexMixedFormat() throws LogfmtParseException
  {
    String testString = "foo=bar a=14 baz=\"hello kitty\" cool%story=bro f %^asdf code=H12 path=/hello/user@foo.com/close";
    Map<String, Object> result = LogfmtParser.parse(testString);
    
    Assert.assertEquals(8, result.size());
    Assert.assertEquals("bar", result.get("foo"));
    Assert.assertEquals("14", result.get("a"));
    Assert.assertEquals("hello kitty", result.get("baz"));
    Assert.assertEquals("bro", result.get("cool%story"));
    Assert.assertEquals(Boolean.TRUE, result.get("f"));
    Assert.assertEquals(Boolean.TRUE, result.get("%^asdf"));
    Assert.assertEquals("H12", result.get("code"));
    Assert.assertEquals("/hello/user@foo.com/close", result.get("path"));
  }
  
  @Test
  public void testEmptyValue() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("key=");
    Assert.assertEquals(1, result.size());
    Assert.assertNull(result.get("key"));
    
    // Empty quoted value should be empty string, not null
    result = LogfmtParser.parse("key=\"\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("", result.get("key"));
  }
  
  @Test
  public void testMultipleSpaces() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=bar    baz=qux");
    Assert.assertEquals(2, result.size());
    Assert.assertEquals("bar", result.get("foo"));
    Assert.assertEquals("qux", result.get("baz"));
  }
  
  @Test
  public void testQuotedStringsWithSpaces() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("msg=\"hello world\" level=info");
    Assert.assertEquals(2, result.size());
    Assert.assertEquals("hello world", result.get("msg"));
    Assert.assertEquals("info", result.get("level"));
  }
  
  @Test
  public void testTrailingNewline() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=bar\n");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("bar", result.get("foo"));
  }
  
  @Test
  public void testEmptyString() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("");
    Assert.assertEquals(0, result.size());
  }
  
  @Test
  public void testNullInput() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse(null);
    Assert.assertNull(result);
  }
  
  @Test
  public void testSingleSpace() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse(" ");
    Assert.assertEquals(0, result.size());
  }
  
  @Test
  public void testMultipleFlagsAndValues() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("flag1 key1=value1 flag2 key2=value2");
    Assert.assertEquals(4, result.size());
    Assert.assertEquals(Boolean.TRUE, result.get("flag1"));
    Assert.assertEquals("value1", result.get("key1"));
    Assert.assertEquals(Boolean.TRUE, result.get("flag2"));
    Assert.assertEquals("value2", result.get("key2"));
  }
  
  @Test
  public void testSpecialCharactersInKeys() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("user.name=john request-id=123 meta_data=test");
    Assert.assertEquals(3, result.size());
    Assert.assertEquals("john", result.get("user.name"));
    Assert.assertEquals("123", result.get("request-id"));
    Assert.assertEquals("test", result.get("meta_data"));
  }
  
  @Test
  public void testEscapedQuotesInValue() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("msg=\"She said \\\"Hello\\\"\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("She said \"Hello\"", result.get("msg"));
  }
  
  @Test
  public void testMixedQuotedAndUnquoted() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("name=john msg=\"hello world\" age=30");
    Assert.assertEquals(3, result.size());
    Assert.assertEquals("john", result.get("name"));
    Assert.assertEquals("hello world", result.get("msg"));
    Assert.assertEquals("30", result.get("age"));
  }
  
  @Test
  public void testValueWithNewlineEscaped() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("msg=\"line1\\nline2\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("line1\nline2", result.get("msg"));
  }
  
  @Test
  public void testValueWithTab() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("msg=\"value\\twith\\ttabs\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("value\twith\ttabs", result.get("msg"));
  }
  
  @Test
  public void testConsecutiveEquals() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("url=\"http://example.com?foo=bar&baz=qux\"");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("http://example.com?foo=bar&baz=qux", result.get("url"));
  }
  
  @Test
  public void testKeyWithoutValueAtEnd() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("foo=bar baz");
    Assert.assertEquals(2, result.size());
    Assert.assertEquals("bar", result.get("foo"));
    Assert.assertEquals(Boolean.TRUE, result.get("baz"));
  }
  
  @Test
  public void testOnlyFlags() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("debug verbose trace");
    Assert.assertEquals(3, result.size());
    Assert.assertEquals(Boolean.TRUE, result.get("debug"));
    Assert.assertEquals(Boolean.TRUE, result.get("verbose"));
    Assert.assertEquals(Boolean.TRUE, result.get("trace"));
  }
  
  @Test
  public void testUnicodeCharacters() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("name=José emoji=😀 chinese=你好");
    Assert.assertEquals(3, result.size());
    Assert.assertEquals("José", result.get("name"));
    Assert.assertEquals("😀", result.get("emoji"));
    Assert.assertEquals("你好", result.get("chinese"));
  }
  
  @Test
  public void testBackslashAtEnd() throws LogfmtParseException
  {
    Map<String, Object> result = LogfmtParser.parse("path=C:\\\\Users\\\\");
    Assert.assertEquals(1, result.size());
    Assert.assertEquals("C:\\Users\\", result.get("path"));
  }
}
