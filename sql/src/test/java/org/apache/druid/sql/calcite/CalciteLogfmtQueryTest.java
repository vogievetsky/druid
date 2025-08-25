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

package org.apache.druid.sql.calcite;

import com.google.common.collect.ImmutableList;
import org.apache.druid.query.Druids;
import org.apache.druid.query.scan.ScanQuery;
import org.apache.druid.segment.column.ColumnType;
import org.apache.druid.segment.virtual.ExpressionVirtualColumn;
import org.apache.druid.sql.calcite.filtration.Filtration;
import org.apache.druid.sql.calcite.util.CalciteTests;
import org.junit.Test;

/**
 * Test SQL queries using logfmt parsing functions.
 */
public class CalciteLogfmtQueryTest extends BaseCalciteQueryTest
{
  @Test
  public void testParseLogfmtSimple() throws Exception
  {
    testQuery(
        "SELECT PARSE_LOGFMT('foo=bar baz=qux') as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "parse_logfmt('foo=bar baz=qux')",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"{\"foo\":\"bar\",\"baz\":\"qux\"}"}
        )
    );
  }

  @Test
  public void testTryParseLogfmtSimple() throws Exception
  {
    testQuery(
        "SELECT TRY_PARSE_LOGFMT('key=value') as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "try_parse_logfmt('key=value')",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"{\"key\":\"value\"}"}
        )
    );
  }

  @Test
  public void testParseLogfmtWithJsonValue() throws Exception
  {
    testQuery(
        "SELECT JSON_VALUE(PARSE_LOGFMT('level=info msg=\"hello world\" count=42'), '$.level') as level",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "json_value(parse_logfmt('level=info msg=\"hello world\" count=42'),'$.level')",
                          ColumnType.STRING,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"info"}
        )
    );
  }

  @Test
  public void testParseLogfmtWithBoolean() throws Exception
  {
    testQuery(
        "SELECT PARSE_LOGFMT('debug=true verbose=false') as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "parse_logfmt('debug=true verbose=false')",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"{\"debug\":true,\"verbose\":false}"}
        )
    );
  }

  @Test
  public void testParseLogfmtWithFlags() throws Exception
  {
    testQuery(
        "SELECT PARSE_LOGFMT('error flag1 flag2') as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "parse_logfmt('error flag1 flag2')",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"{\"error\":true,\"flag1\":true,\"flag2\":true}"}
        )
    );
  }

  @Test
  public void testParseLogfmtWithNull() throws Exception
  {
    testQuery(
        "SELECT PARSE_LOGFMT('key1=value1 key2= key3=value3') as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "parse_logfmt('key1=value1 key2= key3=value3')",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"{\"key1\":\"value1\",\"key2\":null,\"key3\":\"value3\"}"}
        )
    );
  }

  @Test
  public void testTryParseLogfmtWithNull() throws Exception
  {
    testQuery(
        "SELECT TRY_PARSE_LOGFMT(NULL) as parsed",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "try_parse_logfmt(null)",
                          ColumnType.NESTED_DATA,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{null}
        )
    );
  }

  @Test
  public void testParseLogfmtNumbersAsStrings() throws Exception
  {
    testQuery(
        "SELECT JSON_VALUE(PARSE_LOGFMT('id=12345 ratio=3.14'), '$.id') as id",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "json_value(parse_logfmt('id=12345 ratio=3.14'),'$.id')",
                          ColumnType.STRING,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"12345"}
        )
    );
  }

  @Test
  public void testParseLogfmtComplexExample() throws Exception
  {
    String logLine = "level=info msg=\"Request completed\" status=200 duration=45.3 success=true error=";
    
    testQuery(
        "SELECT " +
        "  JSON_VALUE(PARSE_LOGFMT('" + logLine + "'), '$.level') as level, " +
        "  JSON_VALUE(PARSE_LOGFMT('" + logLine + "'), '$.msg') as message, " +
        "  JSON_VALUE(PARSE_LOGFMT('" + logLine + "'), '$.status') as status",
        ImmutableList.of(
            Druids.newScanQueryBuilder()
                  .dataSource(CalciteTests.DATASOURCE1)
                  .intervals(querySegmentSpec(Filtration.eternity()))
                  .virtualColumns(
                      new ExpressionVirtualColumn(
                          "v0",
                          "json_value(parse_logfmt('" + logLine + "'),'$.level')",
                          ColumnType.STRING,
                          queryFramework().macroTable()
                      ),
                      new ExpressionVirtualColumn(
                          "v1",
                          "json_value(parse_logfmt('" + logLine + "'),'$.msg')",
                          ColumnType.STRING,
                          queryFramework().macroTable()
                      ),
                      new ExpressionVirtualColumn(
                          "v2",
                          "json_value(parse_logfmt('" + logLine + "'),'$.status')",
                          ColumnType.STRING,
                          queryFramework().macroTable()
                      )
                  )
                  .columns("v0", "v1", "v2")
                  .resultFormat(ScanQuery.ResultFormat.RESULT_FORMAT_COMPACTED_LIST)
                  .limit(1)
                  .context(QUERY_CONTEXT_DEFAULT)
                  .build()
        ),
        ImmutableList.of(
            new Object[]{"info", "Request completed", "200"}
        )
    );
  }
}
