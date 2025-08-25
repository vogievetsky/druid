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

import org.apache.druid.math.expr.Expr;
import org.apache.druid.math.expr.ExprEval;
import org.apache.druid.math.expr.ExprMacroTable;
import org.apache.druid.math.expr.ExprType;
import org.apache.druid.math.expr.ExpressionType;
import org.apache.druid.segment.nested.LogfmtParseException;
import org.apache.druid.segment.nested.LogfmtParser;

import javax.annotation.Nullable;
import java.util.List;
import java.util.Map;

/**
 * Expression macros for parsing logfmt formatted strings.
 */
public class LogfmtExpressions
{
  /**
   * Parse a logfmt string into nested data. Throws an exception if the input is invalid.
   */
  public static class ParseLogfmtExprMacro implements ExprMacroTable.ExprMacro
  {
    public static final String NAME = "parse_logfmt";

    @Override
    public String name()
    {
      return NAME;
    }

    @Override
    public Expr apply(List<Expr> args)
    {
      if (args.size() != 1) {
        throw validationFailed("requires exactly one argument");
      }

      final class ParseLogfmtExpr extends ExprMacroTable.BaseScalarMacroFunctionExpr
      {
        public ParseLogfmtExpr(List<Expr> args)
        {
          super(ParseLogfmtExprMacro.this, args);
        }

        @Override
        public ExprEval eval(ObjectBinding bindings)
        {
          ExprEval arg = args.get(0).eval(bindings);
          if (arg.value() == null) {
            return ExprEval.ofComplex(ExpressionType.NESTED_DATA, null);
          }
          
          if (arg.type().is(ExprType.STRING)) {
            try {
              Map<String, Object> parsed = LogfmtParser.parse(arg.asString());
              return ExprEval.ofComplex(ExpressionType.NESTED_DATA, parsed);
            }
            catch (LogfmtParseException e) {
              throw ParseLogfmtExprMacro.this.processingFailed(e, "bad string input [%s]", arg.asString());
            }
          }
          
          throw ParseLogfmtExprMacro.this.validationFailed(
              "invalid input expected %s but got %s instead",
              ExpressionType.STRING,
              arg.type()
          );
        }

        @Nullable
        @Override
        public ExpressionType getOutputType(InputBindingInspector inspector)
        {
          return ExpressionType.NESTED_DATA;
        }
      }
      
      return new ParseLogfmtExpr(args);
    }
  }

  /**
   * Try to parse a logfmt string into nested data. Returns null if the input is invalid.
   */
  public static class TryParseLogfmtExprMacro implements ExprMacroTable.ExprMacro
  {
    public static final String NAME = "try_parse_logfmt";

    @Override
    public String name()
    {
      return NAME;
    }

    @Override
    public Expr apply(List<Expr> args)
    {
      if (args.size() != 1) {
        throw validationFailed("requires exactly one argument");
      }

      final class TryParseLogfmtExpr extends ExprMacroTable.BaseScalarMacroFunctionExpr
      {
        public TryParseLogfmtExpr(List<Expr> args)
        {
          super(TryParseLogfmtExprMacro.this, args);
        }

        @Override
        public ExprEval eval(ObjectBinding bindings)
        {
          ExprEval arg = args.get(0).eval(bindings);
          if (arg.type().is(ExprType.STRING) && arg.value() != null) {
            try {
              Map<String, Object> parsed = LogfmtParser.parse(arg.asString());
              return ExprEval.ofComplex(ExpressionType.NESTED_DATA, parsed);
            }
            catch (LogfmtParseException e) {
              // Return null on parse failure for try_parse_logfmt
              return ExprEval.ofComplex(ExpressionType.NESTED_DATA, null);
            }
          }
          
          // Return null for non-string or null input
          return ExprEval.ofComplex(ExpressionType.NESTED_DATA, null);
        }

        @Nullable
        @Override
        public ExpressionType getOutputType(InputBindingInspector inspector)
        {
          return ExpressionType.NESTED_DATA;
        }
      }
      
      return new TryParseLogfmtExpr(args);
    }
  }
}
