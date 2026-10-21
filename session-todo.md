1. Revise the language on the home page to be less self-serving.
2. Implement a dynamic page address/tree viewer (probably the horizontal kind?) that:
    1. Shows the current page url you're on such as `home / blog / my favorite defect`.
    2. Each navigation slug will take you to the corresponding page when clicked.
    3. Each navigation slug renders the count of views for the corresponding page.
3. Make sure everything works even if the backing services don't exist.
4. Implement tracing/logging/metrics, the full opentelemetry setup.
5. Make the page footer look better.
