/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { C, sane } from 'druid-query-toolkit';

import { findAllSqlQueriesInText, findSqlQueryPrefix, smartTimeFloor } from './sql';

describe('sql', () => {
  describe('getSqlQueryPrefix', () => {
    it('works when whole query parses', () => {
      expect(
        findSqlQueryPrefix(sane`
          SELECT *
          FROM wikipedia
        `),
      ).toMatchInlineSnapshot(`
        "SELECT *
        FROM wikipedia"
      `);
    });

    it('works when there are two queries', () => {
      expect(
        findSqlQueryPrefix(sane`
          SELECT *
          FROM wikipedia

          SELECT *
          FROM w2
        `),
      ).toMatchInlineSnapshot(`
        "SELECT *
        FROM wikipedia"
      `);
    });

    it('works when there are extra closing parens', () => {
      expect(
        findSqlQueryPrefix(sane`
          SELECT *
          FROM wikipedia)) lololol
        `),
      ).toMatchInlineSnapshot(`
        "SELECT *
        FROM wikipedia"
      `);
    });
  });

  describe('findAllSqlQueriesInText', () => {
    it('works with separate queries', () => {
      const text = sane`
        SELECT *
        FROM wikipedia

        SELECT *
        FROM w2
        LIMIT 5

        SELECT
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 15,
              "line": 2,
            },
            "endOffset": 23,
            "index": 0,
            "sql": "SELECT *
        FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 8,
              "line": 6,
            },
            "endOffset": 49,
            "index": 1,
            "sql": "SELECT *
        FROM w2
        LIMIT 5",
            "startLineColumn": {
              "column": 1,
              "line": 4,
            },
            "startOffset": 25,
          },
        ]
      `);
    });

    it('works with simple query inside', () => {
      const text = sane`
        SELECT
          "channel",
          COUNT(*) AS "Count"
        FROM (SELECT * FROM "wikipedia")
        GROUP BY 1
        ORDER BY 2 DESC
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 16,
              "line": 6,
            },
            "endOffset": 101,
            "index": 0,
            "sql": "SELECT
          "channel",
          COUNT(*) AS "Count"
        FROM (SELECT * FROM "wikipedia")
        GROUP BY 1
        ORDER BY 2 DESC",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 32,
              "line": 4,
            },
            "endOffset": 73,
            "index": 1,
            "sql": "SELECT * FROM "wikipedia"",
            "startLineColumn": {
              "column": 7,
              "line": 4,
            },
            "startOffset": 48,
          },
        ]
      `);
    });

    it('works with CTE query', () => {
      const text = sane`
        WITH w1 AS (
          SELECT channel, page FROM "wikipedia"
        )
        SELECT
          page,
          COUNT(*) AS "cnt"
        FROM w1
        GROUP BY 1
        ORDER BY 2 DESC
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 16,
              "line": 9,
            },
            "endOffset": 124,
            "index": 0,
            "sql": "WITH w1 AS (
          SELECT channel, page FROM "wikipedia"
        )
        SELECT
          page,
          COUNT(*) AS "cnt"
        FROM w1
        GROUP BY 1
        ORDER BY 2 DESC",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 40,
              "line": 2,
            },
            "endOffset": 52,
            "index": 1,
            "sql": "SELECT channel, page FROM "wikipedia"",
            "startLineColumn": {
              "column": 3,
              "line": 2,
            },
            "startOffset": 15,
          },
          {
            "endLineColumn": {
              "column": 16,
              "line": 9,
            },
            "endOffset": 124,
            "index": 2,
            "sql": "SELECT
          page,
          COUNT(*) AS "cnt"
        FROM w1
        GROUP BY 1
        ORDER BY 2 DESC",
            "startLineColumn": {
              "column": 1,
              "line": 4,
            },
            "startOffset": 55,
          },
        ]
      `);
    });

    it('works with select query followed by a replace query', () => {
      const text = sane`
        SELECT * FROM "wiki"

        REPLACE INTO "wikipedia" OVERWRITE ALL
        WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"
        PARTITIONED BY DAY
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 8,
              "line": 3,
            },
            "endOffset": 29,
            "index": 0,
            "sql": "SELECT * FROM "wiki"",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 19,
              "line": 18,
            },
            "endOffset": 401,
            "index": 1,
            "sql": "REPLACE INTO "wikipedia" OVERWRITE ALL
        WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"
        PARTITIONED BY DAY",
            "startLineColumn": {
              "column": 1,
              "line": 3,
            },
            "startOffset": 22,
          },
          {
            "endLineColumn": {
              "column": 11,
              "line": 17,
            },
            "endOffset": 382,
            "index": 2,
            "sql": "WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"",
            "startLineColumn": {
              "column": 1,
              "line": 4,
            },
            "startOffset": 61,
          },
          {
            "endLineColumn": {
              "column": 71,
              "line": 11,
            },
            "endOffset": 298,
            "index": 3,
            "sql": "SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)",
            "startLineColumn": {
              "column": 3,
              "line": 5,
            },
            "startOffset": 79,
          },
          {
            "endLineColumn": {
              "column": 11,
              "line": 17,
            },
            "endOffset": 382,
            "index": 4,
            "sql": "SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"",
            "startLineColumn": {
              "column": 1,
              "line": 13,
            },
            "startOffset": 301,
          },
        ]
      `);
    });

    it('works with explain plan query', () => {
      const text = sane`
        EXPLAIN PLAN FOR
        INSERT INTO "wikipedia"
        WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"
        PARTITIONED BY DAY
        CLUSTERED BY "channel"
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 23,
              "line": 18,
            },
            "endOffset": 404,
            "index": 0,
            "sql": "EXPLAIN PLAN FOR
        INSERT INTO "wikipedia"
        WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"
        PARTITIONED BY DAY
        CLUSTERED BY "channel"",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 23,
              "line": 18,
            },
            "endOffset": 404,
            "index": 1,
            "sql": "INSERT INTO "wikipedia"
        WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"
        PARTITIONED BY DAY
        CLUSTERED BY "channel"",
            "startLineColumn": {
              "column": 1,
              "line": 2,
            },
            "startOffset": 17,
          },
          {
            "endLineColumn": {
              "column": 11,
              "line": 16,
            },
            "endOffset": 362,
            "index": 2,
            "sql": "WITH "ext" AS (
          SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)
        )
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"",
            "startLineColumn": {
              "column": 1,
              "line": 3,
            },
            "startOffset": 41,
          },
          {
            "endLineColumn": {
              "column": 71,
              "line": 10,
            },
            "endOffset": 278,
            "index": 3,
            "sql": "SELECT *
          FROM TABLE(
            EXTERN(
              '{"type":"http","uris":["https://druid.apache.org/data/wikipedia.json.gz"]}',
              '{"type":"json"}'
            )
          ) EXTEND ("isRobot" VARCHAR, "channel" VARCHAR, "timestamp" VARCHAR)",
            "startLineColumn": {
              "column": 3,
              "line": 4,
            },
            "startOffset": 59,
          },
          {
            "endLineColumn": {
              "column": 11,
              "line": 16,
            },
            "endOffset": 362,
            "index": 4,
            "sql": "SELECT
          TIME_PARSE("timestamp") AS "__time",
          "isRobot",
          "channel"
        FROM "ext"",
            "startLineColumn": {
              "column": 1,
              "line": 12,
            },
            "startOffset": 281,
          },
        ]
      `);
    });

    it('works with multiple explain plan queries', () => {
      const text = sane`
        EXPLAIN PLAN FOR
        SELECT *
        FROM wikipedia

        EXPLAIN PLAN FOR
        SELECT *
        FROM w2
        LIMIT 5

      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 15,
              "line": 3,
            },
            "endOffset": 40,
            "index": 0,
            "sql": "EXPLAIN PLAN FOR
        SELECT *
        FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 15,
              "line": 3,
            },
            "endOffset": 40,
            "index": 1,
            "sql": "SELECT *
        FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 2,
            },
            "startOffset": 17,
          },
          {
            "endLineColumn": {
              "column": 8,
              "line": 8,
            },
            "endOffset": 83,
            "index": 2,
            "sql": "EXPLAIN PLAN FOR
        SELECT *
        FROM w2
        LIMIT 5",
            "startLineColumn": {
              "column": 1,
              "line": 5,
            },
            "startOffset": 42,
          },
          {
            "endLineColumn": {
              "column": 8,
              "line": 8,
            },
            "endOffset": 83,
            "index": 3,
            "sql": "SELECT *
        FROM w2
        LIMIT 5",
            "startLineColumn": {
              "column": 1,
              "line": 6,
            },
            "startOffset": 59,
          },
        ]
      `);
    });

    it('works with SET statements', () => {
      const text = sane`
        SET timeout = 100;
        SET timeout = 50;
        SELECT * FROM wikipedia
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 24,
              "line": 3,
            },
            "endOffset": 60,
            "index": 0,
            "sql": "SET timeout = 100;
        SET timeout = 50;
        SELECT * FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
        ]
      `);
    });

    it('works with multiple SET statement queries', () => {
      const text = sane`
        SET timeout = 100;
        SELECT * FROM wikipedia


        SET timeout = 50;
        SET sqlTimeZone = 'Etc/UTC';
        SELECT * FROM wikipedia
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 24,
              "line": 2,
            },
            "endOffset": 42,
            "index": 0,
            "sql": "SET timeout = 100;
        SELECT * FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 24,
              "line": 7,
            },
            "endOffset": 115,
            "index": 1,
            "sql": "SET timeout = 50;
        SET sqlTimeZone = 'Etc/UTC';
        SELECT * FROM wikipedia",
            "startLineColumn": {
              "column": 1,
              "line": 5,
            },
            "startOffset": 45,
          },
        ]
      `);
    });

    it('test', () => {
      const text = sane`
        SET finalizeAggregations = FALSE;
        SET groupByEnableMultiValueUnnesting = FALSE;
        REPLACE INTO "kttm-v2-2019-08-25" OVERWRITE ALL
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "agent_category",
          "agent_type",
          "browser",
          "browser_version",
          "city",
          "continent",
          "country",
          "version",
          "event_type",
          "event_subtype",
          "loaded_image",
          "adblock_list",
          "forwarded_for",
          ARRAY_TO_MV("language") AS "language",
          "number",
          "os",
          "path",
          "platform",
          "referrer",
          "referrer_host",
          "region",
          "remote_address",
          "screen",
          "session",
          "session_length",
          "timezone",
          "timezone_offset",
          "window"
        FROM "ext"
        PARTITIONED BY DAY
      `;

      const found = findAllSqlQueriesInText(text);

      expect(found).toMatchInlineSnapshot(`
        [
          {
            "endLineColumn": {
              "column": 19,
              "line": 35,
            },
            "endOffset": 655,
            "index": 0,
            "sql": "SET finalizeAggregations = FALSE;
        SET groupByEnableMultiValueUnnesting = FALSE;
        REPLACE INTO "kttm-v2-2019-08-25" OVERWRITE ALL
        SELECT
          TIME_PARSE("timestamp") AS "__time",
          "agent_category",
          "agent_type",
          "browser",
          "browser_version",
          "city",
          "continent",
          "country",
          "version",
          "event_type",
          "event_subtype",
          "loaded_image",
          "adblock_list",
          "forwarded_for",
          ARRAY_TO_MV("language") AS "language",
          "number",
          "os",
          "path",
          "platform",
          "referrer",
          "referrer_host",
          "region",
          "remote_address",
          "screen",
          "session",
          "session_length",
          "timezone",
          "timezone_offset",
          "window"
        FROM "ext"
        PARTITIONED BY DAY",
            "startLineColumn": {
              "column": 1,
              "line": 1,
            },
            "startOffset": 0,
          },
          {
            "endLineColumn": {
              "column": 11,
              "line": 34,
            },
            "endOffset": 636,
            "index": 1,
            "sql": "SELECT
          TIME_PARSE("timestamp") AS "__time",
          "agent_category",
          "agent_type",
          "browser",
          "browser_version",
          "city",
          "continent",
          "country",
          "version",
          "event_type",
          "event_subtype",
          "loaded_image",
          "adblock_list",
          "forwarded_for",
          ARRAY_TO_MV("language") AS "language",
          "number",
          "os",
          "path",
          "platform",
          "referrer",
          "referrer_host",
          "region",
          "remote_address",
          "screen",
          "session",
          "session_length",
          "timezone",
          "timezone_offset",
          "window"
        FROM "ext"",
            "startLineColumn": {
              "column": 1,
              "line": 4,
            },
            "startOffset": 128,
          },
        ]
      `);
    });
  });

  describe('findAllSqlQueriesInText with pipe syntax', () => {
    const queriesIn = (text: string) =>
      findAllSqlQueriesInText(text).map(({ sql, startLineColumn }) => [startLineColumn.line, sql]);

    it('finds FROM-first queries', () => {
      expect(queriesIn('FROM wikipedia')).toEqual([[1, 'FROM wikipedia']]);

      expect(
        queriesIn(sane`
          SELECT 1;
          FROM wikipedia AS w
          LEFT JOIN t USING (k)
          |> WHERE channel = '#en.wikipedia' -- A comment
          |> AGGREGATE COUNT(*) AS cnt GROUP AND ORDER BY page;

          FROM t
        `),
      ).toEqual([
        [1, 'SELECT 1;'],
        [
          2,
          sane`
            FROM wikipedia AS w
            LEFT JOIN t USING (k)
            |> WHERE channel = '#en.wikipedia' -- A comment
            |> AGGREGATE COUNT(*) AS cnt GROUP AND ORDER BY page;
          `,
        ],
        [7, 'FROM t'],
      ]);
    });

    it('finds FROM-first queries in parentheses', () => {
      expect(
        queriesIn(sane`
          SELECT *
          FROM (
            FROM t
            |> WHERE x IN (SELECT y FROM u)
          )
          |> UNION ALL (
            FROM u |> DROP k
          )
        `),
      ).toEqual([
        [
          1,
          sane`
            SELECT *
            FROM (
              FROM t
              |> WHERE x IN (SELECT y FROM u)
            )
            |> UNION ALL (
              FROM u |> DROP k
            )
          `,
        ],
        [3, 'FROM t\n  |> WHERE x IN (SELECT y FROM u)'],
        [4, 'SELECT y FROM u'],
        [7, 'FROM u |> DROP k'],
      ]);
    });

    it('does not find a query in the FROM clause of a query', () => {
      expect(queriesIn('SELECT *\nFROM t\nWHERE x = 1')).toEqual([
        [1, 'SELECT *\nFROM t\nWHERE x = 1'],
      ]);
    });

    it('goes on to the pipe operators after a query', () => {
      expect(
        queriesIn(sane`
          SET timeout = 100;
          SELECT * FROM t
          |> SELECT a, b
          |> SET a = 1
          |> WITH x AS (SELECT 1)
          |> INSERT INTO u
        `),
      ).toEqual([
        [
          1,
          sane`
            SET timeout = 100;
            SELECT * FROM t
            |> SELECT a, b
            |> SET a = 1
            |> WITH x AS (SELECT 1)
            |> INSERT INTO u
          `,
        ],
        [5, 'SELECT 1'],
      ]);
    });

    it('finds the queries with pipe operators that the toolkit does not parse', () => {
      expect(
        queriesIn(sane`
          WITH w AS (FROM t |> TABLESAMPLE SYSTEM (10 PERCENT))
          FROM w
          |> PIVOT (SUM(x) FOR y IN (1, 2))
        `),
      ).toEqual([
        [
          1,
          sane`
            WITH w AS (FROM t |> TABLESAMPLE SYSTEM (10 PERCENT))
            FROM w
            |> PIVOT (SUM(x) FOR y IN (1, 2))
          `,
        ],
        [1, 'FROM t |> TABLESAMPLE SYSTEM (10 PERCENT)'],
      ]);
    });
  });

  describe('smartTimeFloor', () => {
    const timestampColumn = C('__time');

    it('works with PT1H granularity in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT1H', true);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'PT1H')`);
    });

    it('works with PT1H granularity not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT1H', false);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'PT1H')`);
    });

    it('aligns PT2H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT2H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT2H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('does not align PT2H to day boundary when in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT2H', true);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'PT2H')`);
    });

    it('aligns PT3H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT3H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT3H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('aligns PT4H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT4H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT4H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('aligns PT6H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT6H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT6H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('aligns PT8H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT8H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT8H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('aligns PT12H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT12H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT12H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('aligns PT24H to day boundary when not in UTC', () => {
      const result = smartTimeFloor(timestampColumn, 'PT24H', false);
      expect(result.toString()).toEqual(
        `TIME_FLOOR("__time", 'PT24H', TIME_FLOOR("__time", 'P1D'))`,
      );
    });

    it('does not align PT5H (non-divisor) to day boundary', () => {
      const result = smartTimeFloor(timestampColumn, 'PT5H', false);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'PT5H')`);
    });

    it('works with P1D granularity', () => {
      const result = smartTimeFloor(timestampColumn, 'P1D', false);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'P1D')`);
    });

    it('works with P1W granularity', () => {
      const result = smartTimeFloor(timestampColumn, 'P1W', false);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'P1W')`);
    });

    it('works with P1M granularity', () => {
      const result = smartTimeFloor(timestampColumn, 'P1M', true);
      expect(result.toString()).toEqual(`TIME_FLOOR("__time", 'P1M')`);
    });
  });
});
