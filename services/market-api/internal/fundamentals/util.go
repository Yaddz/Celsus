package fundamentals

import "time"

const secondDuration = time.Second

func nowUTC() time.Time { return time.Now().UTC() }
