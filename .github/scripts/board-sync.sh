#!/usr/bin/env bash
# Mirrors an issue's workflow label onto the Status field of the factory board, so the board stays
# in step with the labels the factory-kit skills set. A closed issue is `done`; otherwise the most
# advanced workflow label wins; an issue with none of them is `inbox`.
#
# It talks to the GraphQL API through `gh api graphql`, not `gh project`: `gh project` insists on
# the read:org and read:discussion scopes, which a board owned by the token's own account doesn't
# need. The board is the token owner's (`viewer`) project number PROJECT_NUMBER.
#
# Env: GH_TOKEN (classic, scopes project and repo), ISSUE_NODE_ID, ISSUE_NUMBER, ISSUE_STATE
# (open|closed), ISSUE_LABELS_JSON (a JSON array of label names), PROJECT_NUMBER.
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

project=$(gh api graphql -F number="$PROJECT_NUMBER" -f query='
  query($number: Int!) {
    viewer {
      projectV2(number: $number) {
        id
        field(name: "Status") {
          ... on ProjectV2SingleSelectField { id options { id name } }
        }
      }
    }
  }' --jq .data.viewer.projectV2)
project_id=$(jq -r .id <<<"$project")
field_id=$(jq -r .field.id <<<"$project")
option_id=$(jq -r --arg status "$status" '.field.options[] | select(.name == $status) | .id' <<<"$project")
if [ -z "$option_id" ]; then
  echo "::error::The board's Status field has no option named '$status'."
  exit 1
fi

# Adding an issue that is already on the board returns its existing item.
item_id=$(gh api graphql -f project="$project_id" -f content="$ISSUE_NODE_ID" -f query='
  mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
  }' --jq .data.addProjectV2ItemById.item.id)

gh api graphql -f project="$project_id" -f item="$item_id" -f field="$field_id" -f option="$option_id" -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option }
    }) { projectV2Item { id } }
  }' >/dev/null

echo "#$ISSUE_NUMBER -> $status"
