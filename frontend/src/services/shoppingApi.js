import api from './api';

export const shoppingApi = {
  getShoppingList: async () => {
    const response = await api.get('/shopping');
    return response.data;
  },

  addItem: async (data) => {
    const response = await api.post('/shopping', data);
    return response.data;
  },

  editItem: async (id, data) => {
    const response = await api.put(`/shopping/${id}`, data);
    return response.data;
  },

  markAsBought: async (id, price = 0) => {
    const response = await api.put(`/shopping/${id}/buy`, { price });
    return response.data;
  },

  unmarkAsBought: async (id) => {
    const response = await api.put(`/shopping/${id}/unbuy`);
    return response.data;
  },

  deleteItem: async (id) => {
    const response = await api.delete(`/shopping/${id}`);
    return response.data;
  }
};
