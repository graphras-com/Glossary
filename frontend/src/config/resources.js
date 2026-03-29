/**
 * Application resource configuration — the single source of truth for the frontend.
 *
 * When creating a new application from the template, modify this file to
 * define your domain entities and their fields.  The generic CRUD components
 * (CrudList, CrudCreate, CrudEdit, CrudDetail) read this config to auto-
 * generate pages for each resource.
 *
 * Field types:
 *   "text"     — single-line text input
 *   "textarea" — multi-line text area
 *   "select"   — dropdown populated from `source` resource
 *   "number"   — numeric input
 *   "code"     — rendered in <code> tags in list views
 *
 * Special field options:
 *   source        — resource name to populate a <select> (e.g. "categories")
 *   sourceLabel   — function (item, breadcrumb) => display text for select options
 *   showInList    — show this field as a column in the list view
 *   showInForm    — true | "create-only" | "edit-only" | false
 *   required      — HTML5 required attribute
 *   nullable      — if true, empty strings are sent as null
 *   rows          — textarea rows
 */

export const resources = [
  {
    name: "categories",
    label: "Categories",
    labelSingular: "Category",
    apiPath: "/categories",
    pkField: "id",
    pkType: "string",
    navOrder: 2,
    listDisplay: "table",
    searchable: false,
    fields: [
      {
        name: "id",
        label: "ID",
        type: "text",
        required: true,
        showInList: true,
        showInForm: "create-only",
        render: "code",
        placeholder: "e.g. network.wireless",
      },
      {
        name: "label",
        label: "Label",
        type: "text",
        required: true,
        showInList: true,
        showInForm: true,
      },
      {
        name: "parent_id",
        label: "Parent",
        type: "select",
        source: "categories",
        sourceLabel: (item, breadcrumb) =>
          `${breadcrumb(item.id)} (${item.id})`,
        showInList: true,
        showInForm: true,
        nullable: true,
        emptyLabel: "None (top-level)",
        render: "code",
      },
    ],
    children: [],
  },
  {
    name: "terms",
    label: "Terms",
    labelSingular: "Term",
    apiPath: "/terms",
    pkField: "id",
    pkType: "number",
    navOrder: 1,
    listDisplay: "detail-cards",
    searchable: true,
    searchPlaceholder: "Search terms...",
    filters: [
      {
        param: "category",
        label: "Category",
        type: "select",
        source: "categories",
        emptyLabel: "All categories",
      },
    ],
    fields: [
      {
        name: "term",
        label: "Term",
        type: "text",
        required: true,
        showInList: true,
        showInForm: true,
      },
    ],
    children: [
      {
        name: "definitions",
        label: "Definitions",
        labelSingular: "Definition",
        parentFk: "term_id",
        fields: [
          {
            name: "en",
            label: "English",
            type: "textarea",
            required: true,
            showInList: true,
            showInForm: true,
            rows: 3,
          },
          {
            name: "da",
            label: "Danish",
            type: "textarea",
            showInList: true,
            showInForm: true,
            nullable: true,
            rows: 3,
            suffix: "(optional)",
          },
          {
            name: "category_id",
            label: "Category",
            type: "select",
            source: "categories",
            required: true,
            showInList: true,
            showInForm: true,
          },
        ],
      },
    ],
  },
];

/**
 * Application-level configuration.
 */
export const appConfig = {
  /** Application name shown in the navbar brand and Home page */
  name: "Telecom Glossary",

  /** Short description for the Home page */
  description:
    "A glossary of telecom terms with bilingual definitions (English / Danish).",

  /** Show backup/restore links in the navbar */
  hasBackup: true,

  /** Role required for restore (destructive operation) */
  backupRole: "Glossary.Admin",

  /** Additional Home page cards (beyond auto-generated resource cards) */
  homeCards: [],
};

/**
 * Find a resource config by name.
 */
export function getResource(name) {
  return resources.find((r) => r.name === name);
}

/**
 * Get resources sorted by navOrder for navigation.
 */
export function getNavResources() {
  return [...resources].sort((a, b) => a.navOrder - b.navOrder);
}
