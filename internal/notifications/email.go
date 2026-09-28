package notifications

import (
	"github.com/mgomes/vibescript/vibes"
	"github.com/mgomes/vibescript/vibes/value"
)

// Email exposes email.send and returns a preview without sending a message.
type Email struct{}

// Bind makes email.send available for one script call.
func (Email) Bind(binding vibes.CapabilityBinding) (map[string]value.Value, error) {
	send, err := vibes.NewTypedBuiltin("email.send", func(
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
			"status":  value.NewString("preview"),
			"to":      args[0],
			"subject": args[1],
			"body":    args[2],
		}), nil
	}, vibes.Signature{
		Params: []vibes.SignatureParam{
			{Name: "to", Type: "string"},
			{Name: "subject", Type: "string"},
			{Name: "body", Type: "string"},
		},
		Result: "hash",
	})
	if err != nil {
		return nil, err
	}

	return map[string]value.Value{
		"email": value.NewObject(map[string]value.Value{"send": send}),
	}, nil
}
