import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'

const Home = lazy(() => import('@/pages/Home'))

export const publicRoutes: RouteObject[] = [{ path: '/', element: <Home /> }]
