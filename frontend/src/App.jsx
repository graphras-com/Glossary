import { BrowserRouter, Routes, Route } from "react-router-dom";
import RequireAuth from "./auth/RequireAuth";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import TermList from "./pages/TermList";
import TermDetail from "./pages/TermDetail";
import TermCreate from "./pages/TermCreate";
import TermEdit from "./pages/TermEdit";
import CategoryList from "./pages/CategoryList";
import CategoryCreate from "./pages/CategoryCreate";
import CategoryEdit from "./pages/CategoryEdit";
import DefinitionCreate from "./pages/DefinitionCreate";
import DefinitionEdit from "./pages/DefinitionEdit";
import Backup from "./pages/Backup";
import Restore from "./pages/Restore";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            {/* Terms */}
            <Route path="terms" element={<TermList />} />
            <Route path="terms/new" element={<TermCreate />} />
            <Route path="terms/:id" element={<TermDetail />} />
            <Route path="terms/:id/edit" element={<TermEdit />} />

            {/* Definitions (nested under terms) */}
            <Route path="terms/:termId/definitions/new" element={<DefinitionCreate />} />
            <Route path="terms/:termId/definitions/:definitionId/edit" element={<DefinitionEdit />} />

            {/* Categories */}
            <Route path="categories" element={<CategoryList />} />
            <Route path="categories/new" element={<CategoryCreate />} />
            <Route path="categories/:id/edit" element={<CategoryEdit />} />

            {/* Backup / Restore */}
            <Route path="backup" element={<Backup />} />
            <Route path="restore" element={<Restore />} />

            {/* 404 catch-all */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </RequireAuth>
    </BrowserRouter>
  );
}
