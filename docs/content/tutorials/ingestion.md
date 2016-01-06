---
layout: doc_page
---

# Loading Data

## Choosing an ingestion method

Druid supports real-time and batch ingestion methods. The most
popular configurations are:

- [Batch](ingestion-batch.html) - Load data from HDFS, S3, local files, or any supported Hadoop
filesystem in batches. We recommend this method if your dataset is already in flat files.

- [Stream push](ingestion-streams.html#stream-push) - Push a data stream into Druid in real-time
using [Tranquility](http://github.com/druid-io/tranquility), a client library for sending streams
to Druid. We recommend this method if your dataset originates in a streaming system like Kafka,
Storm, Spark Streaming, or your own system.

- [Stream pull](ingestion-streams.html#stream-pull) - Pull a data stream directly from an external
data source into Druid using Realtime Nodes.

## Hybrid batch/streaming

You can combine batch and streaming methods in a hybrid batch/streaming architecture. In a hybrid
architecture, you use a streaming method to do initial ingestion, and then periodically re-ingest
older data in batch mode (typically every few hours, or nightly).

Hybrid architectures are simple with Druid, since batch loaded data for a particular time range
automatically replaces streaming loaded data for that same time range. All Druid queries seamlessly
access historical data together with real-time data.

We recommend this kind of architecture if you need real-time analytics but *also* need 100% fidelity
for historical data. All streaming ingestion methods currently supported by Druid do introduce the
possibility of dropped or duplicated messages in certain failure scenarios, and batch re-ingestion
eliminates this potential source of error for historical data. This also gives you the option to
re-ingest your data if necessary. This could occur if you missed some data the first time around,
or because you need to revise your data.
