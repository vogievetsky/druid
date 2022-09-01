package org.apache.druid.msq.querykit.scan;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;
import it.unimi.dsi.fastutil.ints.Int2ObjectMaps;
import org.apache.druid.frame.key.ClusterBy;
import org.apache.druid.frame.processor.FrameProcessorExecutor;
import org.apache.druid.frame.processor.FrameProcessors;
import org.apache.druid.java.util.common.Intervals;
import org.apache.druid.java.util.common.concurrent.Execs;
import org.apache.druid.msq.input.ReadableInput;
import org.apache.druid.query.Druids;
import org.apache.druid.query.scan.ScanQuery;
import org.apache.druid.query.spec.MultipleIntervalSegmentSpec;
import org.apache.druid.segment.join.JoinableFactoryWrapper;
import org.apache.druid.segment.join.NoopJoinableFactory;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

public class ScanQueryFrameProcessorTest
{
  private FrameProcessorExecutor exec;

  @Before
  public void setUp() throws Exception
  {
    exec = new FrameProcessorExecutor(MoreExecutors.listeningDecorator(Execs.singleThreaded("test-exec")));
  }

  @After
  public void tearDown() throws Exception
  {
    exec.getExecutorService().shutdownNow();
    exec.getExecutorService().awaitTermination(10, TimeUnit.MINUTES);
  }

  @Test
  public void test_runWithInputChannel() throws Exception
  {
    final ScanQuery query =
        Druids.newScanQueryBuilder()
              .dataSource("test")
              .intervals(new MultipleIntervalSegmentSpec(Intervals.ONLY_ETERNITY))
              .build();

    final ScanQueryFrameProcessor processor = new ScanQueryFrameProcessor(
        query,
        signautr,
        ClusterBy.none(),
        ReadableInput.channel(inputChannel, frameReader, stagePartition),
        Int2ObjectMaps.emptyMap(),
        new JoinableFactoryWrapper(NoopJoinableFactory.INSTANCE),
        outputChannelHolder,
        allocatorHolder,
        null,
        0L
    );

    Long retVal = exec.runFully(processor, null).get();
    Assert.assertEquals(frame.numRows() * 10, retVal);
  }
}
