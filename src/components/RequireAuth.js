import { useLocation, Navigate, Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth";

const RequireAuth = ({ allowedRoles }) => {
    const { auth } = useAuth();
    const location = useLocation();
    const normalizeRole = (role) => {
        const normalized = String(role || "").trim().toLowerCase();
        if (normalized === "wholesale") return "wholesaler";
        return normalized;
    };

    const getRolesFromToken = (token) => {
        try {
            if (!token) return [];
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const tokenRole = payload?.UserInfo?.role;
            if (!tokenRole) return [];
            return Array.isArray(tokenRole) ? tokenRole : [tokenRole];
        } catch (error) {
            return [];
        }
    };

    const rolesFromArrayOrScalar = Array.isArray(auth?.roles) ? auth.roles : [auth?.roles].filter(Boolean);
    const roleFromLegacyField = [auth?.role].filter(Boolean);
    const directRoles = [...rolesFromArrayOrScalar, ...roleFromLegacyField];
    const tokenRoles = getRolesFromToken(auth?.accessToken);
    const rawUserRoles = (directRoles.length ? directRoles : tokenRoles).filter(Boolean);
    const userRoles = rawUserRoles.map(normalizeRole);
    const acceptedRoles = (allowedRoles || []).map(normalizeRole);
    const isAuthenticated = Boolean(auth?.user || auth?.accessToken);

    return (
        userRoles.find((role) => acceptedRoles.includes(role))
            ? <Outlet />
            : isAuthenticated
                ? <Navigate to="/unauthorized" state={{ from: location }} replace />
                : <Navigate to="/login" state={{ from: location }} replace />
    );
}

export default RequireAuth;