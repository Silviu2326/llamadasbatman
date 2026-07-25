// The Organic Leads page is delivered independently from the shell/navigation.
// Keep the route resolvable while that page is absent from a partial checkout.
const organicPageModules = import.meta.glob('../pages/OrganicLeadsPage.jsx', { eager: true })

export const OrganicLeadsPage = organicPageModules['../pages/OrganicLeadsPage.jsx']?.default || null
