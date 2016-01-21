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

package io.druid.query.extraction;

import com.google.common.collect.ImmutableMap;
import com.metamx.common.ISE;
import org.easymock.EasyMock;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;

public class LookupReferencesManagerTest
{
  LookupReferencesManager lookupReferencesManager;

  @Before
  public void setUp()
  {
    lookupReferencesManager = new LookupReferencesManager();
    Assert.assertTrue("must be closed before start call",lookupReferencesManager.isClosed());
    lookupReferencesManager.start();
    Assert.assertFalse("must start after start call", lookupReferencesManager.isClosed());
  }

  @After
  public void tearDown()
  {
    lookupReferencesManager.stop();
    Assert.assertTrue("stop call should close it", lookupReferencesManager.isClosed());
  }

  @Test(expected = ISE.class)
  public void testGetExceptionWhenClosed()
  {
    lookupReferencesManager.stop();
    lookupReferencesManager.get("test");
  }

  @Test(expected = ISE.class)
  public void testAddExceptionWhenClosed()
  {
    lookupReferencesManager.stop();
    lookupReferencesManager.addLookup("test", EasyMock.createMock(LookupExtractor.class));
  }

  @Test
  public void testAddAndGetAndRemove()
  {
    LookupExtractor mapLookupExtractor = new MapLookupExtractor(Collections.<String, String>emptyMap(), false);
    Assert.assertNull(lookupReferencesManager.get("test"));
    lookupReferencesManager.addLookup("test", mapLookupExtractor);
    Assert.assertEquals(mapLookupExtractor, lookupReferencesManager.get("test"));
    Assert.assertTrue(lookupReferencesManager.remove("test"));
    Assert.assertNull(lookupReferencesManager.get("test"));
  }

  @Test
  public void testCloseIsCalledAfterStopping() throws IOException
  {
    LookupExtractor mockLookupExtractor = EasyMock.createStrictMock(LookupExtractor.class);
    mockLookupExtractor.close();
    EasyMock.expectLastCall();
    EasyMock.replay(mockLookupExtractor);
    lookupReferencesManager.addLookup("testMock", mockLookupExtractor);
    lookupReferencesManager.stop();
    EasyMock.verify(mockLookupExtractor);
  }

  @Test
  public void testCloseIsCalledAfterRemove() throws IOException
  {
    LookupExtractor mockLookupExtractor = EasyMock.createStrictMock(LookupExtractor.class);
    mockLookupExtractor.close();
    EasyMock.expectLastCall();
    EasyMock.replay(mockLookupExtractor);
    lookupReferencesManager.addLookup("testMock", mockLookupExtractor);
    lookupReferencesManager.remove("testMock");
    EasyMock.verify(mockLookupExtractor);
  }

  @Test
  public void testRemoveInExisting()
  {
    Assert.assertFalse(lookupReferencesManager.remove("notThere"));
  }

  @Test
  public void testGetNotThere()
  {
    Assert.assertNull(lookupReferencesManager.get("notThere"));
  }

  @Test
  public void testAddingWithSameLookupName()
  {
    LookupExtractor lookupExtractor1 = new MapLookupExtractor(Collections.EMPTY_MAP, false);
    LookupExtractor lookupExtractor2 = new MapLookupExtractor(ImmutableMap.of("key", "value"), false);
    Assert.assertTrue(lookupReferencesManager.addLookup("testName",lookupExtractor1));
    Assert.assertFalse(lookupReferencesManager.addLookup("testName",lookupExtractor2));
    Assert.assertEquals(lookupExtractor1, lookupReferencesManager.get("testName"));
  }

  @Test
  public void testAddLookupsThenGetAll()
  {
    LookupExtractor lookupExtractor1 = new MapLookupExtractor(Collections.EMPTY_MAP, false);
    LookupExtractor lookupExtractor2 = new MapLookupExtractor(ImmutableMap.of("key", "value"), false);
    ImmutableMap<String, LookupExtractor> extractorImmutableMap = ImmutableMap.of("name1", lookupExtractor1, "name2", lookupExtractor2);
    lookupReferencesManager.addLookups(extractorImmutableMap);
    Assert.assertEquals(extractorImmutableMap, lookupReferencesManager.getAll());
  }
}
