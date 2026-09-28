// Package notifications provides fake SMS and email capabilities for the site examples.
package notifications

import (
	"github.com/mgomes/vibescript/vibes"
	"github.com/mgomes/vibescript/vibes/value"
)

// SMS exposes sms.send and returns a preview without sending a message.
type SMS struct{}

// Bind makes sms.send available for one script call.
func (SMS) Bind(binding vibes.CapabilityBinding) (map[string]value.Value, error) {
	send, err := vibes.NewTypedBuiltin("sms.send", func(
		_ *vibes.Execution,
		_ value.Value,
		args []value.Value,
		_ map[string]value.Value,
		_ value.Value,
	) (value.Value, error) {
		if err := binding.Context.Err(); err != nil {
			return value.NewNil(), err
		}
		return value.NewHash(map[string]value.Value{
			"status": value.NewString("preview"),
			"to":     args[0],
			"body":   args[1],
		}), nil
	}, vibes.Signature{
		Params: []vibes.SignatureParam{
			{Name: "to", Type: "string"},
			{Name: "body", Type: "string"},
		},
		Result: "hash",
	})
	if err != nil {
		return nil, err
	}

	return map[string]value.Value{
		"sms": value.NewObject(map[string]value.Value{"send": send}),
	}, nil
}
