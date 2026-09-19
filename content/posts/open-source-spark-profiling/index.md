---
title: "Data Profiling with Spark"
date: 2026-09-13
summary: "Walkthrough of my open source contributions to fg-data-profiling, a library that implements data profiling at scale with Spark."
tags: ["spark", "data engineering"]
categories: ["open source"]
featureimage: "spark_plus_profiling.jpg"
showHero: true
heroStyle: thumbAndBackground
series: 
  - "Open Source Contributions"
series_order: 1
---

## Series Intro
In this series, I will share my experiences in contributing to open source software.
I have really enjoyed contributing back to libraries that have been useful in my career, and want to encourage and inspire others to jump in and do the same!

## Background
One of the foundational activities when trying to assess data quality at scale is data profiling.
Put simply, it's analyzing high-level exploratory metrics like:

> [!example]
> * Row Counts
> * Numerical column statistics (mean, median, distributions)
> * Categorical column information (distinct values, distinct counts)
> * Fill rates of columns (how many are null?)

Last year, my team was asked to perform a large-scale data quality initiative, so we had a need for an efficient process that could deliver exploratory insights in a repeatable fashion.

We needed a process that supported tables with tens of millions of records, most of which are delta lake tables in our data lake, and we landed on a tool called [fg-data-profiling](https://github.com/data-centric-ai-community/fg-data-profiling).

{{< github repo="data-centric-ai-community/fg-data-profiling" showThumbnail=true >}}

The tagline itself describes exactly why we like it:
> 1 Line of code data quality profiling & exploratory data analysis for Pandas and Spark DataFrames.

### Using fg-data-profiling
With just a couple lines of code, you get a nice fancy HTML export that you can explore and share:

```python
import numpy as np
import pandas as pd
from data_profiling import ProfileReport

df = pd.DataFrame(np.random.rand(100, 5), columns=["a", "b", "c", "d", "e"])

profile = ProfileReport(df, title="YData Profiling Report")

profile.to_file("your_report.html")
```

Which would produce an output that looks like this:

![html report](https://docs.profiling.ydata.ai/4.14/_static/img/iframe.gif)

> [!NOTE]
> This image is from their documentation at [https://docs.profiling.ydata.ai/](https://docs.profiling.ydata.ai/latest/getting-started/quickstart/).
> 
> What is `ydata-profiling`? They just re-branded to `fg-data-profiling`.

### A Case for Spark
That example uses [pandas](https://pandas.pydata.org/) to run a profile on that `DataFrame`, which is great when data is small and fits in memory easily.
At the time, my team was testing this all out in our [Azure Synapse](https://azure.microsoft.com/en-us/products/synapse-analytics) implementation.
The profiles were taking **~20+ minutes** initially because this code was running pandas directly on the driver node, and not taking advantage of the entire Spark cluster.

For the volume of data my team was profiling, we needed to leverage [Spark](https://spark.apache.org/docs/latest/api/python/index.html) so that all the heavy lifting would happen in our Spark Cluster.
Good thing `fg-data-profiling` supports Spark DataFrames! 

The same profiles that were taking 20+ minutes were now running in **~2 minutes - a 10x speedup!**

{{< chart >}}
type: 'bar',
data: {
  labels: ['pandas', 'Spark'],
  datasets: [{
    data: [20, 2],
    backgroundColor: [
      'rgba(255, 99, 132, 0.2)',
      'rgba(255, 159, 64, 0.2)'
    ],
    borderColor: [
      'rgb(255, 99, 132)',
      'rgb(255, 159, 64)'
    ],
    borderWidth: 1,
  }]
},
options: { 
  indexAxis: 'y',
  responsive: true,
  plugins: {
    legend: {
      display: false
    },
    title: {
      display: true,
      text: 'Profile Runtime: pandas vs. Spark',
    }
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Duration (minutes)',
      },
      grid: {
        drawOnChartArea: false
      }
    },
    y: {
      grid: {
        drawOnChartArea: false,
        drawTicks: false
      }
    }
  }
}
{{< /chart >}}

Time to celebrate?! Well...

## The Problem
Running the data profiling in Spark was fast, however, when we compared those outputs to our slower examples in pandas, we noticed that they produced completely different results.
(In data, it's always good to be skeptical and constantly verify EVERYTHING).
This didn't sit well with me, so I decided to dive into the library's implementation to see what could possibly be different.

Luckily, this library is written in pure python, so it was incredibly easy to reason through how the profiling works under the hood.
Here is how I approached discovering the differences:

### Test Driven Development
I find [Test Driven Development](https://en.wikipedia.org/wiki/Test-driven_development) one of the best ways to not only build new software, but also explore bugs and assumptions about behavior.
In this case, the assumption is: 
> Given the same dataset, the data profile report should be the same for pandas and Spark

Sounds like a reasonable assumption, so I built a toy dataset to test this theory:

```python
from typing import List, Optional, Tuple

from pyspark.sql import types as T

RowType = Tuple[
    Optional[str],
    Optional[float],
    Optional[int],
    Optional[bool],
    Optional[float],
    Optional[str],
]


def create_test_df(spark: SparkSession) -> DataFrame:
    schema = T.StructType(
        [
            T.StructField("category", T.StringType(), True),
            T.StructField("double", T.DoubleType(), True),
            T.StructField("int", T.IntegerType(), True),
            T.StructField("boolean", T.BooleanType(), True),
            T.StructField("null_double", T.DoubleType(), True),
            T.StructField("null_string", T.StringType(), True),
        ]
    )

    data: List[RowType] = [
        (f"test_{num + 1}", float(num), int(num), True, None, None)
        for num in range(205)
    ]

    # Adding dupes
    data.extend([("test_1", float(1), int(1), False, None, None) for _ in range(205)])

    # Adding nulls
    data.extend([(None, None, None, None, None, None) for _ in range(100)])

    return spark.createDataFrame(data, schema=schema)
```

There are some key features about this data that we should see in the profile:
* There's a field for every type that was having issues
* We duplicate a bunch of the numeric values to ensure the distribution is skewed
* We duplicate a categorical field to also show a skewed distribution
* We add a sizable amount of nulls, including columns that are always null

Now we can run the profile, once for pandas, then for spark and compare the outputs.

```python
from data_profiling import ProfileReport

# ... assuming we have a spark session as the `spark` variable

spark_df = create_test_df(spark)
pandas_df = spark_df.toPandas()

pandas_profile = ProfileReport(pandas_df, title="Pandas Profiling Report")
spark_profile = ProfileReport(spark_df, title="Spark Profiling Report")

pandas_profile.to_file("pandas_example.html")
spark_profile.to_file("spark_example.html")
```

### Initial State - pandas
Here is what that initial profile looks like when run with a pandas dataframe:

{{< gallery-zoom 
  images="{pandas_first.png,pandas_second.png}" 
  interval="5000" 
  aspectRatio="4-3" 
  captions="{pandas_first.png:double column profile in `pandas`,pandas_second.png:double column profile in `pandas` (common values)}">}}

### Initial State - Spark
But here is what that same dataset looked like when profiled in Spark:

{{< gallery-zoom 
  images="spark_first_broken.png,spark_second_broken.png}" 
  interval="5000" 
  aspectRatio="4-3" 
  captions="{spark_first_broken.png:double column profile in `Spark`,spark_second_broken.png:double column profile in `Spark` (common values)}">}}

Clearly there are some *glaring* differences in the output.

>[!bug]
> * Spark shows a *flat* distribution of values, when the actual data shows that the value of 1 is duplicated far more
> * The missing count in Spark shows `310`, but we know there are only `100` missing values
> * Most of the descriptive stats in Spark are `nan` or far off from pandas

Now that we have a small, controlled dataset as our baseline, and we have these observed failures,
we can now dig into the source code and figure out what needs to be fixed.

## The Solution

There were a lot of changes that went into [the PR I put up to resolve each of these issues](https://github.com/Data-Centric-AI-Community/fg-data-profiling/pull/1800).
Let's walk through each of the main problems and their solutions based on the key changes that were made in that PR.

### Fixing Flat Distribution
To fix the flat distribution of distinct values, here are the relevant code changes:
{{< github-file-diff repo="Data-Centric-AI-Community/fg-data-profiling" pr="1800" file="src/ydata_profiling/model/spark/describe_counts_spark.py" >}}

The problem here in the original code the produces the profile for a single column.
It was running a count on **an already aggregated dataframe**:

```python {hl_lines=[10, 18]}
value_counts = series.groupBy(series.columns[0]).count()

...

if series.dtypes[0][1] in ("int", "float", "bigint", "double"):
        value_counts_no_nan = (
            value_counts.filter(F.col(column).isNotNull())  # Exclude NaNs
            .filter(~F.isnan(F.col(column)))  # Remove implicit NaNs (if numeric column)
            .groupBy(column)  # Group by unique values
            .count()  # Count occurrences
            .orderBy(F.desc("count"))  # Sort in descending order
            .limit(200)  # Limit for performance
        )
else:
    value_counts_no_nan = (
        value_counts.filter(F.col(column).isNotNull())  # Exclude NULLs
        .groupBy(column)  # Group by unique timestamp values
        .count()  # Count occurrences
        .orderBy(F.desc("count"))  # Sort by most frequent timestamps
        .limit(200)  # Limit for performance
    )
```

With our test dataset that we created, we should have numbers 1 - 205, with 1 being duplicated many times, so the `value_counts` dataframe would be a table like this:

| decimal | count |
|---|---|
| 1 | 206 |
| 2 | 1 |
| 3 | 1 |
| ... | ...|
| 205 | 1 |

But the original code was running a `.count()` on that aggregated dataset, so the resulting table ended up just counting the rows like this:

| decimal | count |
|---|---|
| 1 | 1 |
| 2 | 1 |
| 3 | 1 |
| ... | ...|
| 205 | 1 |

That leaves every value at a flat count of 1 for every unique variable and not the actual distribution like we expect.
The solution is to switch to a **sum of the count column**:

```python {hl_lines=[10, 17]}
value_counts = series.groupBy(series.columns[0]).count()

...

if series.dtypes[0][1] in ("int", "float", "bigint", "double"):
        value_counts_no_nan = (
            value_counts.filter(F.col(column).isNotNull())  # Exclude NaNs
            .filter(~F.isnan(F.col(column)))  # Remove implicit NaNs (if numeric column)
            .groupBy(column)  # Group by unique values
            .agg(F.sum("count").alias("count"))  # Sum of count
            .orderBy(F.desc("count"))  # Sort in descending order
        )
else:
    value_counts_no_nan = (
        value_counts.filter(F.col(column).isNotNull())  # Exclude NULLs
        .groupBy(column)  # Group by unique timestamp values
        .agg(F.sum("count").alias("count"))  # Sum of count
        .orderBy(F.desc("count"))  # Sort by most frequent timestamps
    )
```

Now the distribution is fixed! 

### Fixing Missing Count

In that same fix above, we resolved the proper "Missing" counts by removing the `limit(200)` line.
That makes sure all records were returned, because it's basing everything off of the total row count.
When it was limiting to the top 200 records, then any row that wasn't in the top 200 was considered "missing" even though it wasn't null.

Another nuance here is that we needed to make sure that `NaN` values were counted as "Missing" as well, because Spark **does NOT** count those as Null:
```python  {hl_lines=[3, 4, 5, 6]}
if series.dtypes[0][1] in ("int", "float", "bigint", "double"):
        n_missing = (
            # Need to add the isnan() check because Pandas isnull check will count NaN as null, but Spark does not
            value_counts.filter(
                F.col(series.columns[0]).isNull() | F.isnan(F.col(series.columns[0]))
            )
            .select("count")
            .first()
        )
else:
    n_missing = (
        # Need to add the isnan() check because Pandas isnull check will count NaN as null, but Spark does not
        value_counts.filter(F.col(series.columns[0]).isNull())
        .select("count")
        .first()
    )
```

Now the output of the actual count of unique values is fixed! Let's move onto the numerical summary issue.

### Fixing Numerical Summary
Here are the specific code changes that resolve the other numerical summary issues:
{{< github-file-diff repo="Data-Centric-AI-Community/fg-data-profiling" pr="1800" file="src/ydata_profiling/model/spark/describe_numeric_spark.py" >}}

The root cause of the mismatching summary statistics is due to a difference in how pandas handles null values vs. how Spark handles that scenario.

As an example,[ take the documentation for the `mean` function in pandas](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.mean.html#pandas.DataFrame.mean).
The key observation here is:
> The `skipna` argument defaults to `True`.
> 
> [source code](https://github.com/pandas-dev/pandas/blob/v3.0.6/pandas/core/frame.py#L14398)

This means that for a column that has null values, the summary statistic to be computed filters out any null values.
In pandas, `NaN` values are considered null, but in Spark, `NaN` is considered not null and will simply return a `NaN` for the aggregate summary statistic.

Therefore, to match pandas' output, our Spark solution had to filter out exactly what pandas would filter out, so things like `NaN` (not a number), null values, and any values representing infinity.

The other edge case we handle with our test dataset is where columns can be completely null. 
These were breaking in the reports, so we forced a default `NaN` value when we aren't able to actually compute the statistic.

### Other Misc Fixes
The rest of the changes in [the PR](https://github.com/Data-Centric-AI-Community/fg-data-profiling/pull/1800) handle a couple edge cases that our test data produced:

* Fixes reporting cases when a column was entirely null (certain reports would simply break or not render, so we render a placeholder instead)
* Enables the `DecimalType` in numerical stats, because we can cast that to a float and perform the same mathematical operations easily.

### Fixed State - Spark vs. Pandas
With all of these fixes, Spark's output is now correctly matching the original pandas output:

{{< gallery-zoom 
  images="{pandas_first.png,spark_first_fixed.png}" 
  interval="5000" 
  aspectRatio="4-3" 
  captions="{pandas_first.png:double column profile in `pandas`,spark_first_fixed.png:double column profile in `Spark`}">}}

{{< gallery-zoom 
  images="{pandas_second.png,spark_second_fixed.png}" 
  interval="5000" 
  aspectRatio="4-3" 
  captions="{pandas_second.png:double column profile in `pandas` (common values),spark_second_fixed.png:double column profile in `Spark` (common values)">}}


## Conclusion
Once we had these changes implemented and merged, our team was able to fully leverage the [fg-data-profiling](https://github.com/data-centric-ai-community/fg-data-profiling) tool for our data quality audit.
This vastly sped up our iteration time as we could take full advantage of the Spark cluster to get the answers we needed.

Personally, this is what I consider to be my first impactful contribution to an open-source project.
When I was fixing this for my team, I realized I could give back to the community by simply sharing what I found.
It was incredibly rewarding to see 4 different issues resolved based on this one PR, and then to see a release cut so quickly after getting this merged!

The team who maintains [fg-data-profiling](https://github.com/data-centric-ai-community/fg-data-profiling) was so responsive and kind in their feedback, which inspired me to seek out more opportunities to contribute to open-source projects.

Looking forward to sharing more of my adventures in open source in this series!
