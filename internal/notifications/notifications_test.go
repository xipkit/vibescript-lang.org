package notifications_test

import (
	"testing"

	"github.com/mgomes/vibescript/vibes"
	"github.com/xipkit/vibescript-lang.org/internal/notifications"
)

func TestAdaptersRejectInvalidCalls(t *testing.T) {
	cases := []struct {
		name    string
		call    string
		adapter vibes.CapabilityAdapter
	}{
		{name: "sms recipient type", call: `sms.send(123, "hello")`, adapter: notifications.SMS{}},
		{name: "sms body type", call: `sms.send("+12025550123", false)`, adapter: notifications.SMS{}},
		{name: "sms missing body", call: `sms.send("+12025550123")`, adapter: notifications.SMS{}},
		{name: "sms extra argument", call: `sms.send("+12025550123", "hello", "extra")`, adapter: notifications.SMS{}},
		{name: "sms keyword", call: `sms.send("+12025550123", "hello", urgent: true)`, adapter: notifications.SMS{}},
		{name: "email recipient type", call: `email.send(123, "Welcome", "hello")`, adapter: notifications.Email{}},
		{name: "email subject type", call: `email.send("alex@example.com", false, "hello")`, adapter: notifications.Email{}},
		{name: "email body type", call: `email.send("alex@example.com", "Welcome", 123)`, adapter: notifications.Email{}},
		{name: "email missing body", call: `email.send("alex@example.com", "Welcome")`, adapter: notifications.Email{}},
		{name: "email extra argument", call: `email.send("alex@example.com", "Welcome", "hello", "extra")`, adapter: notifications.Email{}},
		{name: "email keyword", call: `email.send("alex@example.com", "Welcome", "hello", cc: "sam@example.com")`, adapter: notifications.Email{}},
	}
	engine := vibes.MustNewEngine(vibes.Config{StrictEffects: true})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			script, err := engine.Compile("def run\n" + tc.call + "\nend")
			if err != nil {
				t.Fatalf("Compile(%q): %v", tc.call, err)
			}
			_, err = script.Call(t.Context(), "run", nil, vibes.CallOptions{
				Capabilities: []vibes.CapabilityAdapter{tc.adapter},
			})
			if err == nil {
				t.Errorf("Call(%q) succeeded, want invalid arguments rejected", tc.call)
			}
		})
	}
}

func TestAdaptersOnlyExposeTheirOwnService(t *testing.T) {
	engine := vibes.MustNewEngine(vibes.Config{StrictEffects: true})
	for _, tc := range []struct {
		call    string
		adapter vibes.CapabilityAdapter
	}{
		{call: `email.send("alex@example.com", "Welcome", "hello")`, adapter: notifications.SMS{}},
		{call: `sms.send("+12025550123", "hello")`, adapter: notifications.Email{}},
	} {
		script, err := engine.Compile("def run\n" + tc.call + "\nend")
		if err != nil {
			t.Fatalf("Compile(%q): %v", tc.call, err)
		}
		_, err = script.Call(t.Context(), "run", nil, vibes.CallOptions{
			Capabilities: []vibes.CapabilityAdapter{tc.adapter},
		})
		if err == nil {
			t.Errorf("Call(%q) with %T succeeded, want unavailable service rejected", tc.call, tc.adapter)
		}
	}
}
