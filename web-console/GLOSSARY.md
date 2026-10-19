<!--
  ~ Licensed to the Apache Software Foundation (ASF) under one
  ~ or more contributor license agreements.  See the NOTICE file
  ~ distributed with this work for additional information
  ~ regarding copyright ownership.  The ASF licenses this file
  ~ to you under the Apache License, Version 2.0 (the
  ~ "License"); you may not use this file except in compliance
  ~ with the License.  You may obtain a copy of the License at
  ~
  ~   http://www.apache.org/licenses/LICENSE-2.0
  ~
  ~ Unless required by applicable law or agreed to in writing,
  ~ software distributed under the License is distributed on an
  ~ "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  ~ KIND, either express or implied.  See the License for the
  ~ specific language governing permissions and limitations
  ~ under the License.
  -->

# Web console

The Apache Druid web console: the UI for querying Druid, loading data into it and managing a cluster.

## Language

### Pipe syntax

**Pipe syntax**:
The GoogleSQL way of writing a query as a sequence of steps, each starting with the pipe symbol. Druid does not run it
yet, but the console highlights and completes it.
_Avoid_: Pipe SQL, pipes, pipeline syntax

**Pipe query**:
A query that uses pipe syntax.
_Avoid_: Piped query, pipes query

**Pipe operator**:
One step of a pipe query: the pipe symbol, the operator name and its arguments, like `|> WHERE x > 1`.
_Avoid_: Pipe, pipe clause, pipe step

**Pipe symbol**:
The `|>` that starts every pipe operator.
_Avoid_: Pipe token, pipe arrow

**Operator name**:
The keywords right after the pipe symbol that say which pipe operator it is, like `WHERE`, `ORDER BY` or `LEFT JOIN`.
_Avoid_: Operator keyword, pipe keyword

**FROM-first query**:
A query that starts with `FROM` and has no `SELECT`, usually followed by pipe operators.
_Avoid_: FROM query, standalone FROM

**Subpipeline**:
Pipe operators in parentheses with no query before them, like `( |> WHERE x > 1 )`, given to the `IF`, `FORK`, `TEE`
and `RECURSIVE UNION` pipe operators.
