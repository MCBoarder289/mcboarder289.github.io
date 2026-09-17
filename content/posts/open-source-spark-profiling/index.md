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
I have really enjoyed being able to contribute back to libraries that have been useful in my career, and want to encourage and inspire others to jump in and do the same!

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
> What is `ydata-profiling`? They just rebranded to `fg-data-profiling`.

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

Sounds like a reasonable assumption. So I built a toy dataset to test this theory:

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

{{< carousel images="{pandas_first.png,pandas_second.png}" interval="2500" aspectRatio="4-3" captions="{pandas_first.png:double column profile in `pandas`,pandas_second.png:double column profile in `pandas` (common values)}">}}

### Initial State - Spark
But here is what that same dataset looked like when profiled in Spark:

{{< carousel images="spark_first_broken.png,spark_second_broken.png}" interval="2500" aspectRatio="4-3" captions="{spark_first_broken.png:double column profile in `Spark`,spark_second_broken.png:double column profile in `Spark` (common values)}">}}

Clearly there are some *glaring* differences in the output.

>[!bug]
> * Spark shows a *flat* distribution of values, when clearly the data shows that the value of 1 is duplicated far more
> * Most of the descriptive stats in Spark are `nan` or far off from pandas
> * The missing count in Spark shows `310`, but we know there are only `100` missing values

So now that we have a small, controlled dataset as our baseline, and we have these observed failures,
we can now dig into the source code and figure out what needs to be fixed.

{{< github-file-diff repo="Data-Centric-AI-Community/fg-data-profiling" pr="1800" file="src/ydata_profiling/model/spark/describe_numeric_spark.py" >}}