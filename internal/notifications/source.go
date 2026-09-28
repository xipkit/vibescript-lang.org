package notifications

import _ "embed"

// SMSSource is the Go adapter shown on the SMS example page.
//
//go:embed sms.go
var SMSSource string

// EmailSource is the Go adapter shown on the email example page.
//
//go:embed email.go
var EmailSource string
