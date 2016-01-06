---
layout: doc_page
---

## Load your own streaming data

Before you get started with loading your own streaming data, you should have first completed the [quickstart](quickstart.html).

## Stream Push

If you have a program that generates a stream, then you can push that stream directly into Druid in 
real-time. With this approach, [Tranquility](https://github.com/druid-io/tranquility) (a Druid-aware 
client) is embedded in your data-producing application. Tranquility comes with bindings for the 
Storm and Samza stream processors. It also has a direct API that can be used from any JVM-based 
program, such as Spark Streaming or a Kafka consumer.

Tranquility handles partitioning, replication, service discovery, and schema rollover for you, 
seamlessly and without downtime. You only have to define your Druid schema.

For examples and more information, please see the [Tranquility README](https://github.com/druid-io/tranquility).

TODO example with your own data.

## Stream Pull

If you have an external service that you want to pull data from, you have two options. The simplest
option is to set up a "copying" service that reads from the data source and writes to Druid using
the [stream push method](#stream-push).

Another option is *stream pull*. With this approach, a Druid Realtime Node ingests data from a
[Firehose](../ingestion/firehose.html) connected to the data you want to
read. Druid includes builtin firehoses for Kafka, RabbitMQ, and various other streaming systems.

For more information on loading streaming data via a push based approach, please see [here](../ingestion/stream-push.html).

For more information on loading streaming data via a pull based approach, please see [here](../ingestion/stream-pull.html).
