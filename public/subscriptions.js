document.addEventListener('DOMContentLoaded', () => {
    const stripe = Stripe('pk_test_your_publishable_key'); // Remplacez par votre clé publique Stripe
    const elements = stripe.elements();
    const card = elements.create('card');
    card.mount('#card-element');

    let selectedDays = 0;
    let selectedAmount = 0;

    // Afficher le formulaire au clic sur un bouton Souscrire
    document.querySelectorAll('.subscribe-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedDays = e.target.dataset.days;
            selectedAmount = e.target.dataset.amount;
            document.getElementById('payment-form-container').style.display = 'block';
            calculateEndDate();
        });
    });

    // Calculer la date de fin en fonction de la date de début
    document.getElementById('start-date').addEventListener('change', calculateEndDate);

    function calculateEndDate() {
        const startDateInput = document.getElementById('start-date').value;
        if (startDateInput) {
            const startDate = new Date(startDateInput);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + parseInt(selectedDays));
            document.getElementById('end-date').textContent = `Date de fin: ${endDate.toLocaleDateString('fr-FR')}`;
        }
    }

    // Annuler et cacher le formulaire
    document.getElementById('cancel-payment').addEventListener('click', () => {
        document.getElementById('payment-form-container').style.display = 'none';
    });

    // Soumettre le paiement
    document.getElementById('payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { paymentMethod, error } = await stripe.createPaymentMethod({
            type: 'card',
            card: card,
        });

        if (error) {
            document.getElementById('card-errors').textContent = error.message;
        } else {
            const response = await fetch('/create-payment-intent',    {
                amount: selectedAmount,
                currency: 'eur',
            });
            const { clientSecret } = await response.json();

            const { error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: paymentMethod.id,
            });

            if (confirmError) {
                document.getElementById('card-errors').textContent = confirmError.message;
            } else {
                alert('Paiement réussi ! Votre abonnement est actif.');
                document.getElementById('payment-form-container').style.display = 'none';
            }
        }
    });
});