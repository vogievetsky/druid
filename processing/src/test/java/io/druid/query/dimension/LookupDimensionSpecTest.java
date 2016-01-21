/*
 * Licensed to Metamarkets Group Inc. (Metamarkets) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. Metamarkets licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package io.druid.query.dimension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.common.collect.ImmutableMap;
import io.druid.jackson.DefaultObjectMapper;
import io.druid.query.extraction.ExtractionFn;
import io.druid.query.extraction.MapLookupExtractor;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;

public class LookupDimensionSpecTest
{
  private DimensionSpec lookupDimSpec;

  @Before
  public void setUp()
  {
    lookupDimSpec = new LookupDimensionSpec("dimName", "outputName", new MapLookupExtractor(
        ImmutableMap.<String, String>of("key", "value"),
        true
    ));
  }

  @Test
  public void testSerDesr() throws IOException
  {
    ObjectMapper mapper = new DefaultObjectMapper();
    String serLookup = mapper.writeValueAsString(lookupDimSpec);
    Assert.assertEquals(lookupDimSpec, mapper.reader(DimensionSpec.class).readValue(serLookup));
  }


  @Test
  public void testGetDimension()
  {
    Assert.assertEquals("dimName", lookupDimSpec.getDimension());
  }

  @Test
  public void testGetOutputName()
  {
    DimensionSpec lookupDimSpec = new LookupDimensionSpec("dimName", "outputName", new MapLookupExtractor(
        Collections.<String, String>emptyMap(),
        false
    ));
    Assert.assertEquals("outputName", lookupDimSpec.getOutputName());
  }

  @Test
  public void testGetExtractionFn()
  {
    Assert.assertEquals(null, lookupDimSpec.getExtractionFn().apply("not there"));
    Assert.assertEquals("value", lookupDimSpec.getExtractionFn().apply("key"));
  }

  @Test
  public void testGetCacheKey()
  {
    DimensionSpec lookupDimSpec2 = new LookupDimensionSpec("dimName", "outputName", new MapLookupExtractor(
        Collections.<String, String>emptyMap(),
        false
    ));
    Assert.assertFalse(Arrays.equals(lookupDimSpec.getCacheKey(), lookupDimSpec2.getCacheKey()));
  }

  @Test
  public void testPreservesOrdering()
  {
    Assert.assertFalse(lookupDimSpec.preservesOrdering());
  }

  @Test
  public void testIsOneToOne()
  {
    Assert.assertEquals(lookupDimSpec.getExtractionFn().getExtractionType(), ExtractionFn.ExtractionType.ONE_TO_ONE);
  }
}
