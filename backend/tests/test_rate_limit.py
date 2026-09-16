from security.rate_limit import SlidingWindowLimiter


def test_allows_until_limit():
    limiter = SlidingWindowLimiter()
    assert limiter.allow("k", 2, 60) is True
    assert limiter.allow("k", 2, 60) is True
    assert limiter.allow("k", 2, 60) is False


def test_separate_keys_are_independent():
    limiter = SlidingWindowLimiter()
    assert limiter.allow("a", 1, 60) is True
    assert limiter.allow("b", 1, 60) is True
    assert limiter.allow("a", 1, 60) is False
