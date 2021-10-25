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

package org.apache.druid.math.expr.vector;

import org.apache.druid.math.expr.ExpressionType;

/**
 * specialized {@link BivariateFunctionVectorProcessor} for processing (long[], double[]) -> double[]
 */
public abstract class DoubleOutLongDoubleInFunctionVectorProcessor
    extends BivariateFunctionVectorProcessor<long[], double[], double[]>
{
  public DoubleOutLongDoubleInFunctionVectorProcessor(
      ExprVectorProcessor<long[]> left,
      ExprVectorProcessor<double[]> right,
      int maxVectorSize
  )
  {
    super(
        CastToTypeVectorProcessor.cast(left, ExpressionType.LONG),
        CastToTypeVectorProcessor.cast(right, ExpressionType.DOUBLE),
        maxVectorSize,
        new double[maxVectorSize]
    );
  }

  public abstract double apply(long left, double right);

  @Override
  public ExpressionType getOutputType()
  {
    return ExpressionType.DOUBLE;
  }

  @Override
  final void processIndex(long[] leftInput, double[] rightInput, int i)
  {
    outValues[i] = apply(leftInput[i], rightInput[i]);
  }

  @Override
  final ExprEvalVector<double[]> asEval()
  {
    return new ExprEvalDoubleVector(outValues, outNulls);
  }
}
