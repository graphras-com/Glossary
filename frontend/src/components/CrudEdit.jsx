/**
 * Generic edit page that wraps CrudForm.
 *
 * Props:
 *   resource       — resource config object
 *   parentResource — optional parent resource config (for nested children)
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import CrudForm from "./CrudForm";

export default function CrudEdit({ resource, parentResource }) {
  const navigate = useNavigate();
  const params = useParams();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [parentLabel, setParentLabel] = useState("");

  const id = params.childId || params.id;
  const parentId = params.parentId;

  useEffect(() => {
    async function load() {
      try {
        if (parentResource && parentId) {
          // Editing a nested child: fetch parent to find the child data
          const parent = await api[parentResource.name].get(parentId);
          const mainField = parentResource.fields[0];
          setParentLabel(parent[mainField.name]);

          const childItems = parent[resource.name] || [];
          const child = childItems.find((c) => c.id === Number(id));
          if (child) {
            setInitialData(child);
          } else {
            setLoadError(`${resource.labelSingular} not found`);
          }
        } else {
          // Editing a top-level resource
          const data = await api[resource.name].get(id);
          setInitialData(data);
        }
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, parentId, resource.name, resource.labelSingular, parentResource]);

  async function handleSubmit(data) {
    if (parentResource && parentId) {
      await api[parentResource.name][resource.name].update(parentId, id, data);
      navigate(`/${parentResource.name}`, {
        state: { scrollToItem: parentId },
      });
    } else {
      await api[resource.name].update(id, data);
      navigate(`/${resource.name}`, {
        state: { scrollToItem: resource.pkType === "number" ? Number(id) : id },
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

  if (loading) return <p className="loading">Loading...</p>;
  if (loadError) return <p className="error">{loadError}</p>;

  const title = parentResource
    ? `Edit ${resource.labelSingular} for \u201c${parentLabel}\u201d`
    : resource.pkType === "string" && initialData
    ? `Edit ${resource.labelSingular}: ${initialData[resource.pkField]}`
    : undefined;

  return (
    <CrudForm
      resource={resource}
      mode="edit"
      initialData={initialData || {}}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      title={title}
    />
  );
}
