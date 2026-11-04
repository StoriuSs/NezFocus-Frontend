import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'

const Home = lazy(() => import('@/pages/Home'))
const FormExample = lazy(() => import('@/pages/FormExample'))

export const publicRoutes: RouteObject[] = [
    { path: '/', element: <Home /> },
    { path: '/form', element: <FormExample /> }
]
