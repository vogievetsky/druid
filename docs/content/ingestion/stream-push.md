---
layout: doc_page
---

## Stream Push

If you have a program that generates a stream, then you can push that stream directly into Druid in 
real-time. With this approach, [Tranquility](https://github.com/druid-io/tranquility) (a Druid-aware 
ingest client) is embedded in your data-producing application. Tranquility comes with bindings for the 
Storm and Samza stream processors. It also has a direct API that can be used from any JVM-based 
program, such as Spark Streaming or a Kafka consumer.

Tranquility handles partitioning, replication, service discovery, and schema rollover for you,
seamlessly and without downtime. You only have to define your Druid schema.

For examples and more information, please see the [Tranquility README](https://github.com/druid-io/tranquility).

```note-info
Note that with all streaming ingestion options, you must ensure that messages you send are recent
enough (within a configurable *windowPeriod* of the current time). Older messages will not be
processed in real-time. Historical data is best processed with [batch ingestion](batch-ingestion.html).
```

### HTTP

https://github.com/druid-io/tranquility/blob/master/docs/server.md

TODO detail

### From Kafka

https://github.com/druid-io/tranquility/blob/master/docs/kafka.md

TODO detail

### From Stream Processors

https://github.com/druid-io/tranquility/blob/master/docs/storm.md

https://github.com/druid-io/tranquility/blob/master/docs/samza.md

https://github.com/druid-io/tranquility/blob/master/docs/spark.md

https://github.com/druid-io/tranquility/blob/master/docs/flink.md

TODO detail

### From JVM apps

https://github.com/druid-io/tranquility/blob/master/docs/core.md

TODO detail
