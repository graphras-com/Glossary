/**
 * Application root — auto-generates routes from the resource config.
 *
 * This file is **generic**.  When creating a new application from the
 * template, you should not need to modify this file unless you need
 * fully custom pages beyond standard CRUD.
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import RequireAuth from "./auth/RequireAuth";
import Layout from "./components/Layout";
import CrudList from "./components/CrudList";
import CrudCreate from "./components/CrudCreate";
import CrudEdit from "./components/CrudEdit";
import CrudDetail from "./components/CrudDetail";
import Backup from "./pages/Backup";
import Restore from "./pages/Restore";
import NotFound from "./pages/NotFound";
import { resources, appConfig } from "./config/resources";

// ── App-specific page overrides ─────────────────────────────────────
// Import custom pages that replace generic ones for specific resources.
// When creating a new app, remove or replace these imports.
import Home from "./pages/Home";
import TermListPage from "./pages/TermList";
import TermCreatePage from "./pages/TermCreate";

/**
 * Map of resource name -> { list, create, edit, detail } custom components.
 * If a resource is listed here, the custom component is used instead of
 * the generic one.
 *
 * When creating a new app from the template, clear this map to use
 * fully generic pages, or add your own custom overrides.
 */
const pageOverrides = {
  terms: {
    list: TermListPage,
    create: TermCreatePage,
  },
};

function generateResourceRoutes() {
  const routes = [];

  for (const resource of resources) {
    const overrides = pageOverrides[resource.name] || {};

    // List
    const ListComponent = overrides.list || (() => <CrudList resource={resource} />);
    routes.push(
      <Route
        key={`${resource.name}-list`}
        path={resource.name}
        element={<ListComponent />}
      />
    );

    // Create
    const CreateComponent = overrides.create || (() => <CrudCreate resource={resource} />);
    routes.push(
      <Route
        key={`${resource.name}-create`}
        path={`${resource.name}/new`}
        element={<CreateComponent />}
      />
    );

    // Detail
    const DetailComponent = overrides.detail || (() => <CrudDetail resource={resource} />);
    routes.push(
      <Route
        key={`${resource.name}-detail`}
        path={`${resource.name}/:id`}
        element={<DetailComponent />}
      />
    );

    // Edit
    const EditComponent = overrides.edit || (() => <CrudEdit resource={resource} />);
    routes.push(
      <Route
        key={`${resource.name}-edit`}
        path={`${resource.name}/:id/edit`}
        element={<EditComponent />}
      />
    );

    // Nested child routes
    for (const child of resource.children || []) {
      const childOverrides = (overrides.children || {})[child.name] || {};

      // Child create
      const ChildCreateComponent =
        childOverrides.create ||
        (() => <CrudCreate resource={child} parentResource={resource} />);
      routes.push(
        <Route
          key={`${resource.name}-${child.name}-create`}
          path={`${resource.name}/:parentId/${child.name}/new`}
          element={<ChildCreateComponent />}
        />
      );

      // Child edit
      const ChildEditComponent =
        childOverrides.edit ||
        (() => <CrudEdit resource={child} parentResource={resource} />);
      routes.push(
        <Route
          key={`${resource.name}-${child.name}-edit`}
          path={`${resource.name}/:parentId/${child.name}/:childId/edit`}
          element={<ChildEditComponent />}
        />
      );
    }
  }

  return routes;
}

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            {/* Auto-generated resource routes */}
            {generateResourceRoutes()}

            {/* Backup / Restore (generic) */}
            {appConfig.hasBackup && (
              <>
                <Route path="backup" element={<Backup />} />
                <Route path="restore" element={<Restore />} />
              </>
            )}

            {/* 404 catch-all */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </RequireAuth>
    </BrowserRouter>
  );
}
