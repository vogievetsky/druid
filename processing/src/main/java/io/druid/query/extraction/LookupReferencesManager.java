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


import com.google.common.annotations.VisibleForTesting;
import com.google.common.collect.ImmutableMap;
import com.metamx.common.ISE;
import com.metamx.common.lifecycle.LifecycleStart;
import com.metamx.common.lifecycle.LifecycleStop;
import com.metamx.common.logger.Logger;
import io.druid.guice.ManageLifecycle;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * This class provide a basic {@link LookupExtractor} references manager.
 * It allows basic operations fetching, listing, adding and deleting of {@link LookupExtractor} objects
 * It is be used by queries to fetch the lookup reference.
 * It is used by Lookup configuration manager to add/remove or list lookups configuration via HTTP.
 */

@ManageLifecycle
public class LookupReferencesManager
{
  private static final Logger LOGGER = new Logger(LookupReferencesManager.class);
  private final ConcurrentMap<String, LookupExtractor> lookupMap = new ConcurrentHashMap();
  private final Object lock = new Object();
  private final AtomicBoolean started = new AtomicBoolean(false);

  @LifecycleStart
  public void start()
  {
    synchronized (lock) {
      if (!started.getAndSet(true)) {
        LOGGER.info("Started lookup references manager");
      }
    }
  }

  @LifecycleStop
  public void stop()
  {
    synchronized (lock) {
      if (started.getAndSet(false)) {
        for (String lookupName : lookupMap.keySet()) {
          remove(lookupName);
        }
      }
    }
  }

  /**
   * @param lookupName      namespace of the lookup object
   * @param lookupExtractor {@link LookupExtractor} implementation reference.
   *
   * @return true if the lookup is added otherwise false.
   *
   * @throws ISE If the manager is closed.
   */
  public boolean addLookup(String lookupName, final LookupExtractor lookupExtractor) throws ISE
  {
    synchronized (lock) {
      assertStarted();
      return (null == lookupMap.putIfAbsent(lookupName, lookupExtractor));
    }
  }

  /**
   * @param lookups {@link ImmutableMap} containing all the lookup as one batch.
   *
   * @throws ISE if the manager is closed
   */
  public void addLookups(ImmutableMap<String, LookupExtractor> lookups) throws ISE
  {
    synchronized (lock) {
      assertStarted();
      for (ImmutableMap.Entry<String, LookupExtractor> entry : lookups.entrySet()) {
        if (null != lookupMap.putIfAbsent(entry.getKey(), entry.getValue())) {
          LOGGER.warn("lookup with name [%s] is not add since it already exist", entry.getKey());
        }
      }
    }
  }

  /**
   * @param lookupName namespace of {@link LookupExtractor} to delete from the reference registry.
   *                   this function does call the cleaning method {@link LookupExtractor#close()}
   *
   * @return true if it is removed
   */
  public boolean remove(String lookupName)
  {
    final LookupExtractor lookupExtractor = lookupMap.remove(lookupName);
    if (lookupExtractor != null) {
      try {
        LOGGER.debug("Removing lookup [%s]", lookupName);
        lookupExtractor.close();
      }
      catch (IOException e) {
        LOGGER.error(e, "Got exception while closing lookup [%s]", lookupName);
      }
      return true;
    }
    return false;
  }

  /**
   * @param lookupName namespace key to fetch the reference of the object {@link LookupExtractor}
   *
   * @return reference of {@link LookupExtractor} that correspond the the namespace {@code lookupName}
   *
   * @throws ISE if the {@link LookupReferencesManager} is closed or did not start yet
   */
  public LookupExtractor get(String lookupName) throws ISE
  {
    final LookupExtractor extractor = lookupMap.get(lookupName);
    assertStarted();
    return extractor;
  }

  /**
   * @return Returns {@link ImmutableMap} containing a copy of the current state.
   *
   * @throws ISE if the is is closed or not started yet.
   */
  public ImmutableMap<String, LookupExtractor> getAll() throws ISE
  {
    assertStarted();
    return ImmutableMap.copyOf(lookupMap);
  }

  private void assertStarted() throws ISE
  {
    if (isClosed()) {
      throw new ISE("lookup manager is closed");
    }
  }

  @VisibleForTesting
  protected boolean isClosed()
  {
    return !started.get();
  }
}
