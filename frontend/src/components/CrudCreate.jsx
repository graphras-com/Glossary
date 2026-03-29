/**
 * Generic create page that wraps CrudForm.
 *
 * Props:
 *   resource       — resource config object
 *   parentResource — optional parent resource config (for nested children)
 *   children       — passed through to CrudForm (e.g. recommend button)
 */

import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "../api/client";
import CrudForm from "./CrudForm";

export default function CrudCreate({
  resource,
  parentResource,
  children: extraContent,
}) {
  const navigate = useNavigate();
  const params = useParams();
  const [parentLabel, setParentLabel] = useState("");

  // If creating a nested child, fetch parent info for the title
  const parentId = params.parentId;
  useEffect(() => {
    if (parentResource && parentId) {
      api[parentResource.name]
        .get(parentId)
        .then((parent) => {
          const mainField = parentResource.fields[0];
          setParentLabel(parent[mainField.name]);
        })
        .catch(() => {});
    }
  }, [parentResource, parentId]);

  async function handleSubmit(data) {
    if (parentResource && parentId) {
      // Creating a nested child
      await api[parentResource.name][resource.name].create(parentId, data);
      navigate(`/${parentResource.name}`, {
        state: { scrollToItem: parentId },
      });
    } else {
      // Creating a top-level resource
      const created = await api[resource.name].create(data);
      navigate(`/${resource.name}`, {
        state: { scrollToItem: created[resource.pkField] },
      });
    }
  }

  function handleCancel() {
    if (parentResource && parentId) {
      navigate(`/${parentResource.name}/${parentId}`);
    } else {
      navigate(`/${resource.name}`);
    }
  }

  const title = parentResource
    ? `Add ${resource.labelSingular} to \u201c${parentLabel}\u201d`
    : undefined;

  return (
    <CrudForm
      resource={resource}
      mode="create"
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      title={title}
    >
      {extraContent}
    </CrudForm>
  );
}
