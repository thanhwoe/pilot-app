#!/usr/bin/env bash
# Mirrors an issue's workflow label onto the Status field of the factory board, so the board stays
# in step with the labels the factory-kit skills set. A closed issue is `done`; otherwise the most
# advanced workflow label wins; an issue with none of them is `inbox`.
#
# Env: GH_TOKEN (can read the issue and edit the user project), ISSUE_URL, ISSUE_STATE
# (open|closed), ISSUE_LABELS_JSON (a JSON array of label names), PROJECT_OWNER, PROJECT_NUMBER.
set -euo pipefail

status=inbox
if [ "$ISSUE_STATE" = closed ]; then
  status=done
else
  labels=$(jq -r '.[]' <<<"$ISSUE_LABELS_JSON")
  for candidate in review building planned spec ready inbox; do
    if grep -qx "$candidate" <<<"$labels"; then
      status=$candidate
      break
    fi
  done
fi

project_id=$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --jq .id)
field=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --jq '.fields[] | select(.name == "Status")')
field_id=$(jq -r .id <<<"$field")
option_id=$(jq -r --arg status "$status" '.options[] | select(.name == $status) | .id' <<<"$field")
if [ -z "$option_id" ]; then
  echo "::error::The board's Status field has no option named '$status'."
  exit 1
fi

# item-add returns the existing item when the issue is already on the board.
item_id=$(gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$ISSUE_URL" --format json --jq .id)
gh project item-edit --id "$item_id" --project-id "$project_id" --field-id "$field_id" --single-select-option-id "$option_id" >/dev/null
echo "#${ISSUE_URL##*/} -> $status"
