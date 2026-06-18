'use client'

import { User, NewUserData } from './types'

interface AdminUsersTabProps {
  users: User[]
  showUserForm: boolean
  setShowUserForm: (v: boolean) => void
  editingUser: User | null
  setEditingUser: (u: User | null) => void
  newUserData: NewUserData
  setNewUserData: (d: NewUserData) => void
  onCreateUser: () => void
  onUpdateUser: (userId: string, updates: { role?: string; isActive?: boolean; firstName?: string; lastName?: string; phone?: string }) => void
  onDeleteUser: (userId: string) => void
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  customer: 'bg-gray-100 text-gray-800',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  customer: 'Client',
}

export function AdminUsersTab({
  users,
  showUserForm,
  setShowUserForm,
  editingUser,
  setEditingUser,
  newUserData,
  setNewUserData,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}: AdminUsersTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-display text-lg text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Gestion des utilisateurs
        </h3>
        <button
          onClick={() => {
            setEditingUser(null)
            setNewUserData({
              email: '',
              password: '',
              firstName: '',
              lastName: '',
              phone: '',
              role: 'customer',
            })
            setShowUserForm(true)
          }}
          className="px-4 py-2 bg-[#0A0A0A] text-[#F8F6F3] text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors"
        >
          + Nouvel utilisateur
        </button>
      </div>

      {/* User Form Modal */}
      {showUserForm && (
        <div className="bg-white p-6 shadow-sm mb-6">
          <h4 className="font-medium mb-4">
            {editingUser ? "Modifier l'utilisateur" : 'Créer un nouvel utilisateur'}
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6B6560] mb-1">Email *</label>
              <input
                type="email"
                value={editingUser ? editingUser.email : newUserData.email}
                onChange={(e) =>
                  !editingUser && setNewUserData({ ...newUserData, email: e.target.value })
                }
                disabled={!!editingUser}
                className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C] disabled:bg-[#EDE8E1]"
              />
            </div>
            {!editingUser && (
              <div>
                <label className="block text-xs text-[#6B6560] mb-1">Mot de passe *</label>
                <input
                  type="password"
                  value={newUserData.password}
                  onChange={(e) =>
                    setNewUserData({ ...newUserData, password: e.target.value })
                  }
                  className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-[#6B6560] mb-1">Prénom</label>
              <input
                type="text"
                value={editingUser ? editingUser.firstName || '' : newUserData.firstName}
                onChange={(e) =>
                  editingUser
                    ? setEditingUser({ ...editingUser, firstName: e.target.value })
                    : setNewUserData({ ...newUserData, firstName: e.target.value })
                }
                className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6B6560] mb-1">Nom</label>
              <input
                type="text"
                value={editingUser ? editingUser.lastName || '' : newUserData.lastName}
                onChange={(e) =>
                  editingUser
                    ? setEditingUser({ ...editingUser, lastName: e.target.value })
                    : setNewUserData({ ...newUserData, lastName: e.target.value })
                }
                className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6B6560] mb-1">Téléphone</label>
              <input
                type="tel"
                value={editingUser ? editingUser.phone || '' : newUserData.phone}
                onChange={(e) =>
                  editingUser
                    ? setEditingUser({ ...editingUser, phone: e.target.value })
                    : setNewUserData({ ...newUserData, phone: e.target.value })
                }
                className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6B6560] mb-1">Rôle</label>
              <select
                value={editingUser ? editingUser.role : newUserData.role}
                onChange={(e) =>
                  editingUser
                    ? setEditingUser({ ...editingUser, role: e.target.value })
                    : setNewUserData({ ...newUserData, role: e.target.value })
                }
                className="w-full p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
              >
                <option value="customer">Client</option>
                <option value="manager">Manager / Gestionnaire</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() =>
                editingUser
                  ? onUpdateUser(editingUser.id, editingUser)
                  : onCreateUser()
              }
              className="px-6 py-2 bg-[#9C7C5C] text-white text-sm uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
            >
              {editingUser ? 'Enregistrer' : 'Créer'}
            </button>
            <button
              onClick={() => {
                setShowUserForm(false)
                setEditingUser(null)
              }}
              className="px-6 py-2 border border-[#E5E0DA] text-[#0A0A0A] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#EDE8E1]">
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Email</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Nom</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Téléphone</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Rôle</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Statut</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Commandes</th>
                <th className="text-left p-4 text-xs uppercase tracking-widest text-[#0A0A0A]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#E5E0DA] hover:bg-gray-50">
                  <td className="p-4">
                    <p className="font-medium text-[#0A0A0A]">{u.email}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-[#0A0A0A]">
                      {u.firstName} {u.lastName}
                    </p>
                  </td>
                  <td className="p-4">
                    <p className="text-[#6B6560]">{u.phone || '-'}</p>
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                        ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                        u.isActive
                          ? 'bg-[#15803D]/10 text-[#15803D]'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="text-[#6B6560]">
                      {(u as { _count?: { orders: number } })._count?.orders || 0}
                    </p>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingUser(u)
                        setShowUserForm(true)
                      }}
                      className="text-[#9C7C5C] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => onUpdateUser(u.id, { isActive: !u.isActive })}
                      className="text-[#6B6560] hover:text-[#0A0A0A] text-xs uppercase font-bold mr-3"
                    >
                      {u.isActive ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => onDeleteUser(u.id)}
                      className="text-red-600 hover:text-red-800 text-xs uppercase font-bold"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <div className="p-12 text-center text-[#6B6560]">
            Aucun utilisateur dans la base de données.
          </div>
        )}
      </div>
    </div>
  )
}
