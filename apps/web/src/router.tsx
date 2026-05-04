import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Setup } from "./pages/Setup";
import { Identity } from "./pages/Identity";
import { Compose } from "./pages/Compose";
import { Inbox } from "./pages/Inbox";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/inbox" replace /> },
      { path: "inbox", element: <Inbox /> },
      { path: "compose", element: <Compose /> },
      { path: "identity", element: <Identity /> },
      { path: "setup", element: <Setup /> },
    ],
  },
]);
