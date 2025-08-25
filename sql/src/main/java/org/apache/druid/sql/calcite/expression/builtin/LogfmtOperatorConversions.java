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

package org.apache.druid.sql.calcite.expression.builtin;

import org.apache.calcite.rel.type.RelDataType;
import org.apache.calcite.rel.type.RelDataTypeFactory;
import org.apache.calcite.rex.RexNode;
import org.apache.calcite.sql.SqlFunction;
import org.apache.calcite.sql.SqlFunctionCategory;
import org.apache.calcite.sql.SqlOperator;
import org.apache.calcite.sql.SqlOperatorBinding;
import org.apache.calcite.sql.type.SqlReturnTypeInference;
import org.apache.calcite.sql.type.SqlTypeFamily;
import org.apache.druid.java.util.common.StringUtils;
import org.apache.druid.segment.column.ColumnType;
import org.apache.druid.segment.column.RowSignature;
import org.apache.druid.sql.calcite.expression.DruidExpression;
import org.apache.druid.sql.calcite.expression.OperatorConversions;
import org.apache.druid.sql.calcite.expression.SqlOperatorConversion;
import org.apache.druid.sql.calcite.planner.PlannerContext;
import org.apache.druid.sql.calcite.table.RowSignatures;

import javax.annotation.Nullable;

/**
 * SQL operator conversions for logfmt parsing functions.
 */
public class LogfmtOperatorConversions
{
  /**
   * SQL return type inference for nested data type used by both PARSE_LOGFMT and TRY_PARSE_LOGFMT.
   */
  private static final SqlReturnTypeInference NESTED_RETURN_TYPE_INFERENCE = new SqlReturnTypeInference()
  {
    @Override
    public RelDataType inferReturnType(SqlOperatorBinding opBinding)
    {
      final RelDataTypeFactory typeFactory = opBinding.getTypeFactory();
      return RowSignatures.makeComplexType(typeFactory, ColumnType.NESTED_DATA, true);
    }
  };

  /**
   * SQL operator conversion for PARSE_LOGFMT function.
   * Parses a logfmt string into nested data. Throws an exception if the input is invalid.
   */
  public static class ParseLogfmtOperatorConversion implements SqlOperatorConversion
  {
    private static final String FUNCTION_NAME = "parse_logfmt";
    private static final SqlFunction SQL_FUNCTION = OperatorConversions
        .operatorBuilder(StringUtils.toUpperCase(FUNCTION_NAME))
        .operandTypes(SqlTypeFamily.STRING)
        .returnTypeInference(NESTED_RETURN_TYPE_INFERENCE)
        .functionCategory(SqlFunctionCategory.USER_DEFINED_FUNCTION)
        .build();

    @Override
    public SqlOperator calciteOperator()
    {
      return SQL_FUNCTION;
    }

    @Nullable
    @Override
    public DruidExpression toDruidExpression(
        PlannerContext plannerContext,
        RowSignature rowSignature,
        RexNode rexNode
    )
    {
      return OperatorConversions.convertCall(
          plannerContext,
          rowSignature,
          rexNode,
          druidExpressions -> DruidExpression.ofExpression(
              ColumnType.NESTED_DATA,
              DruidExpression.functionCall(FUNCTION_NAME),
              druidExpressions
          )
      );
    }
  }

  /**
   * SQL operator conversion for TRY_PARSE_LOGFMT function.
   * Tries to parse a logfmt string into nested data. Returns null if the input is invalid.
   */
  public static class TryParseLogfmtOperatorConversion implements SqlOperatorConversion
  {
    private static final String FUNCTION_NAME = "try_parse_logfmt";
    private static final SqlFunction SQL_FUNCTION = OperatorConversions
        .operatorBuilder(StringUtils.toUpperCase(FUNCTION_NAME))
        .operandTypes(SqlTypeFamily.STRING)
        .returnTypeInference(NESTED_RETURN_TYPE_INFERENCE)
        .functionCategory(SqlFunctionCategory.USER_DEFINED_FUNCTION)
        .build();

    @Override
    public SqlOperator calciteOperator()
    {
      return SQL_FUNCTION;
    }

    @Nullable
    @Override
    public DruidExpression toDruidExpression(
        PlannerContext plannerContext,
        RowSignature rowSignature,
        RexNode rexNode
    )
    {
      return OperatorConversions.convertCall(
          plannerContext,
          rowSignature,
          rexNode,
          druidExpressions -> DruidExpression.ofExpression(
              ColumnType.NESTED_DATA,
              DruidExpression.functionCall(FUNCTION_NAME),
              druidExpressions
          )
      );
    }
  }
}
